import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { driveHeadlessArgs, githubIo, liveRuns, maxRuns, nextTargets } from './drive.mjs';
import { splitDependencies } from './dependencies.mjs';

// The runner holds no scheduler or queue logic: it asks drive whether ready work exists and starts today's `drive --next`.
export const runnerDefaults = {
  minIntervalMs: 60_000,   // a poll within this of the previous one is skipped
  jitterMs: 15_000,        // each poll first waits a random 0..jitterMs
  quotaBelow: 0.2,         // back off when GraphQL remaining is under this fraction of the limit (#700)
  hangMs: 30 * 60_000,     // a live session whose claim shows no drive progress for this long is terminated
};
export const runnerLogDirectory = repo => join(homedir(), 'Library', 'Logs', 'workflow-runner', repo.replace(/[^A-Za-z0-9._-]+/g, '-'));
export const claimDirectory = () => join(homedir(), '.cache', 'workflow-cli', 'drive-runs');

const sanitized = repo => repo.replace(/[^A-Za-z0-9._-]/g, '_');
// Every claim file this repository holds (issue claims and the --next claim), parsed, with the issue it names.
export function readClaims(directory, repo) {
  const prefix = `${sanitized(repo)}-`;
  let files = [];
  try { files = readdirSync(directory); } catch { /* no claims yet */ }
  const claims = [];
  for (const file of files) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
    try { claims.push({ file, issue: file.slice(prefix.length, -5), ...JSON.parse(readFileSync(join(directory, file), 'utf8')) }); } catch { /* unreadable: not a claim */ }
  }
  return claims;
}
const readState = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; } };
const writeState = (path, state) => writeFileSync(path, JSON.stringify(state));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const terminate = pid => { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } } };

export function probeQuota() {
  const result = spawnSync('gh', ['api', 'rate_limit', '--jq', '.resources.graphql'], { encoding: 'utf8', timeout: 15_000 });
  if (result.error || result.status !== 0) return null;
  try {
    const value = JSON.parse(result.stdout);
    return Number.isFinite(value.remaining) ? { remaining: value.remaining, limit: value.limit, resetAt: new Date(value.reset * 1000).toISOString() } : null;
  } catch { return null; }
}
function startSession({ id, cwd, logDirectory, now }) {
  const log = join(logDirectory, `session-${id}.log`);
  const fd = openSync(log, 'a');
  try {
    const child = nodeSpawn('claude', driveHeadlessArgs(), { cwd, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, WORKFLOW_DRIVE_SESSION: id } });
    child.unref();
    return { id, pid: child.pid, startedAt: now, log };
  } finally { closeSync(fd); }
}
const realIo = lanes => ({ ...githubIo(lanes), probeQuota, start: startSession, alive, terminate, sleep: ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms), random: Math.random, now: Date.now });

// One poll. `io` supplies the clock, jitter, quota, issues and process control so tests run with fakes.
export function runnerPoll(lanes, { io = realIo(lanes), logDirectory = runnerLogDirectory(lanes.repo), claims = claimDirectory(), cwd = process.cwd(), options = runnerDefaults } = {}) {
  mkdirSync(logDirectory, { recursive: true });
  const statePath = join(logDirectory, 'state.json');
  const state = readState(statePath);
  const note = line => writeFileSync(join(logDirectory, 'runner.log'), `${line}\n`, { flag: 'a' });
  if (state.lastPollAt && io.now() - state.lastPollAt < options.minIntervalMs) return { skipped: true, nextPollAt: state.lastPollAt + options.minIntervalMs };
  io.sleep(Math.floor(io.random() * options.jitterMs));
  const at = io.now();
  const stamp = new Date(at).toISOString();
  const quota = io.probeQuota();
  const sessions = [];
  const recovered = [];
  const keep = (session, claimed) => sessions.push({ ...session, claimed });
  for (const session of state.sessions ?? []) {
    const held = readClaims(claims, lanes.repo).filter(claim => claim.session === session.id);
    const release = () => held.forEach(claim => rmSync(join(claims, claim.file), { force: true }));
    if (!io.alive(session.pid)) {
      if (held.length) { release(); recovered.push({ id: session.id, reason: 'crashed', issues: held.map(claim => claim.issue) }); }
      continue;
    }
    const progress = Math.max(0, ...held.map(claim => claim.progressAt ?? claim.at ?? 0), held.length ? 0 : session.startedAt);
    if (at - progress >= options.hangMs) { io.terminate(session.pid); release(); recovered.push({ id: session.id, reason: 'hung', issues: held.map(claim => claim.issue) }); continue; }
    keep(session, held.length > 0);
  }
  const result = { at, quota, started: [], recovered, nextPollAt: at + options.minIntervalMs };
  const finish = (text, extra = {}) => {
    Object.assign(result, extra);
    const shown = quota ? `${quota.remaining}/${quota.limit}` : 'unknown';
    note(`${stamp} quota=${shown} ready=${result.ready ?? 0} live=${result.live ?? sessions.length} started=${result.started.length} recovered=${recovered.length} ${text}`.trim());
    writeState(statePath, { lastPollAt: at, lastResult: text || 'ok', nextPollAt: result.nextPollAt, quota, sessions, recovered: recovered.length ? recovered : undefined });
    for (const item of recovered) note(`${stamp} recovered ${item.id} (${item.reason}) released ${item.issues.join(',') || 'no claim'}`);
    return result;
  };
  if (!quota || quota.remaining < quota.limit * options.quotaBelow) return finish(quota ? `backoff until ${quota.resetAt}` : 'backoff: quota unknown', { backoff: true });
  const live = liveRuns({ directory: claims, repo: lanes.repo, now: at }) + sessions.filter(session => !session.claimed).length;
  const free = maxRuns - live;
  if (free <= 0) return finish('slots full', { live, ready: 0 });
  const taken = new Set(readClaims(claims, lanes.repo).filter(claim => at - claim.at < 30 * 60_000).map(claim => claim.issue));
  const ready = [];
  for (const number of nextTargets(io.openIssues(), issue => splitDependencies(io.dependencies(issue)))) {
    if (!taken.has(String(number))) ready.push(number);
    if (ready.length >= free) break;
  }
  for (let index = 0; index < ready.length; index++) {
    const session = io.start({ id: `runner-${at}-${index}`, cwd, logDirectory, now: at });
    result.started.push(session.id);
    keep(session, false);
  }
  return finish(ready.length ? '' : 'idle', { live, ready: ready.length });
}

export function runnerStatus(lanes, { logDirectory = runnerLogDirectory(lanes.repo), claims = claimDirectory(), now = Date.now(), isAlive = alive } = {}) {
  const state = readState(join(logDirectory, 'state.json'));
  const held = readClaims(claims, lanes.repo);
  return {
    lastPollAt: state.lastPollAt ? new Date(state.lastPollAt).toISOString() : null,
    lastResult: state.lastResult ?? null,
    nextPollAt: state.nextPollAt ? new Date(state.nextPollAt).toISOString() : null,
    quota: state.quota ?? null,
    sessions: (state.sessions ?? []).map(session => ({ id: session.id, pid: session.pid, alive: isAlive(session.pid), issue: held.filter(claim => claim.session === session.id).map(claim => claim.issue).join(',') || null, ageSeconds: Math.round((now - session.startedAt) / 1000) })),
    log: join(logDirectory, 'runner.log'),
  };
}

export function runnerCommand(args, lanes) {
  if (args.length !== 1 || !['poll', 'status'].includes(args[0])) throw new Error('Usage: runner poll|status');
  console.log(JSON.stringify(args[0] === 'poll' ? runnerPoll(lanes) : runnerStatus(lanes)));
}
