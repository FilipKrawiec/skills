import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { git } from './core.mjs';
import { driveHeadlessArgs, githubIo, maxRuns, nextTargets, trustedLogins } from './drive.mjs';
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
    const child = nodeSpawn('claude', driveHeadlessArgs(id), { cwd, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, WORKFLOW_DRIVE_SESSION: id } });
    child.unref();
    return { id, pid: child.pid, startedAt: now, log };
  } finally { closeSync(fd); }
}
const realIo = lanes => ({ ...githubIo(lanes), probeQuota, start: startSession, alive, terminate, sleep: ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms), random: Math.random, now: Date.now });

// One poll. `io` supplies the clock, jitter, quota, issues and process control so tests run with fakes.
export function runnerPoll(lanes, { io = realIo(lanes), logDirectory = runnerLogDirectory(lanes.repo), claims = claimDirectory(), cwd = process.cwd(), options = runnerDefaults } = {}) {
  mkdirSync(logDirectory, { recursive: true });
  // Two simultaneous polls (a slow one and the next launchd tick) must not both start a session: one holds poll.lock, the other leaves.
  const lock = join(logDirectory, 'poll.lock');
  for (let attempt = 0; ; attempt++) {
    try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holder = Number(readFileSync(lock, 'utf8'));
      if (attempt || (holder && alive(holder))) return { skipped: true, locked: true };
      rmSync(lock, { force: true });
    }
  }
  try { return pollLocked(lanes, { io, logDirectory, claims, cwd, options }); } finally { rmSync(lock, { force: true }); }
}
function pollLocked(lanes, { io, logDirectory, claims, cwd, options }) {
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
  // Drive's `--next` claim admits one session at a time, so a second `drive --next` would only return blocked: start one session per poll, and none while one holds that claim or is still starting.
  const fresh = readClaims(claims, lanes.repo).filter(claim => at - claim.at < options.hangMs);
  const pending = sessions.filter(session => !session.claimed).length;
  const live = new Set(fresh.map(claim => claim.session ?? claim.file)).size + pending;
  if (live >= maxRuns) return finish('slots full', { live, ready: 0 });
  if (pending || fresh.some(claim => claim.issue === 'next')) return finish('next claim held', { live, ready: 0 });
  const taken = new Set(fresh.map(claim => claim.issue));
  const ready = [];
  for (const number of nextTargets(io.openIssues(), issue => splitDependencies(io.dependencies(issue)), trustedLogins(lanes))) {
    if (!taken.has(String(number))) { ready.push(number); break; }
  }
  for (const index of ready.keys()) {
    // One UUID is both Claude's `--session-id` (naming its transcript) and WORKFLOW_DRIVE_SESSION, so drive can find that transcript.
    const session = io.start({ id: randomUUID(), cwd, logDirectory, now: at });
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

// launchd job: one per repo, running `runner poll` from a CLI-owned tooling checkout that fast-forwards before each poll.
const toolingUrl = 'https://github.com/FilipKrawiec/skills.git';
const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jobLabel = repo => `com.filipkrawiec.workflow-runner.${repo.replace(/[^A-Za-z0-9._-]+/g, '-')}`;
export const startInterval = 120;
const realLaunchd = () => ({
  home: homedir(), uid: process.getuid(), nodePath: process.execPath, repoRoot: git('rev-parse', '--show-toplevel'),
  launchctl: args => ({ status: spawnSync('launchctl', args, { encoding: 'utf8' }).status ?? 1 }),
  clone: (url, dir) => { mkdirSync(dirname(dir), { recursive: true }); const result = spawnSync('git', ['clone', '--quiet', url, dir], { encoding: 'utf8' }); if (result.status !== 0) throw new Error(`git clone failed: ${result.stderr}`); },
});
function jobPaths(lanes, io) {
  const label = jobLabel(lanes.repo);
  const logs = join(io.home, 'Library', 'Logs', 'workflow-runner', lanes.repo.replace(/[^A-Za-z0-9._-]+/g, '-'));
  const checkout = join(io.home, '.cache', 'workflow-cli', 'skills');
  return { label, logs, checkout, plist: join(io.home, 'Library', 'LaunchAgents', `${label}.plist`), target: `gui/${io.uid}` };
}
export function jobPlist(lanes, io) {
  const { label, logs, checkout } = jobPaths(lanes, io);
  const script = `cd ${JSON.stringify(checkout)} && { git fetch --quiet origin && git merge --ff-only --quiet origin/HEAD; } || echo "tooling update failed; polling on the current checkout" >&2; cd ${JSON.stringify(io.repoRoot)} && exec ${JSON.stringify(io.nodePath)} ${JSON.stringify(join(checkout, 'plugins', 'common', 'workflow', 'scripts', 'workflow.mjs'))} runner poll`;
  const path = [dirname(io.nodePath), join(io.home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':');
  const item = value => `    <string>${xml(value)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${['/bin/sh', '-c', script].map(item).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(io.repoRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(path)}</string>
    <key>HOME</key>
    <string>${xml(io.home)}</string>
  </dict>
  <key>StartInterval</key>
  <integer>${startInterval}</integer>
  <key>StandardOutPath</key>
  <string>${xml(join(logs, 'launchd.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(logs, 'launchd.err.log'))}</string>
</dict>
</plist>
`;
}
export function runnerJob(lanes, io = realLaunchd()) {
  const { label, plist, target } = jobPaths(lanes, io);
  return { installed: existsSync(plist), loaded: io.launchctl(['print', `${target}/${label}`]).status === 0, plist };
}
export function runnerInstall(lanes, io = realLaunchd()) {
  const { label, logs, checkout, plist, target } = jobPaths(lanes, io);
  if (!existsSync(join(checkout, '.git'))) io.clone(toolingUrl, checkout);
  const wanted = jobPlist(lanes, io);
  const current = existsSync(plist) ? readFileSync(plist, 'utf8') : null;
  const loaded = () => io.launchctl(['print', `${target}/${label}`]).status === 0;
  if (current === wanted && loaded()) return { changed: false, message: `unchanged: ${plist} is installed and loaded` };
  mkdirSync(logs, { recursive: true });
  mkdirSync(dirname(plist), { recursive: true });
  if (loaded()) io.launchctl(['bootout', `${target}/${label}`]);
  writeFileSync(plist, wanted);
  if (io.launchctl(['bootstrap', target, plist]).status !== 0) throw new Error(`launchctl bootstrap ${target} failed for ${plist}`);
  return { changed: true, message: `${current === null ? 'installed' : 'updated'}: ${plist} loaded in ${target}` };
}
export function runnerUninstall(lanes, io = realLaunchd()) {
  const { label, plist, target } = jobPaths(lanes, io);
  const loaded = io.launchctl(['print', `${target}/${label}`]).status === 0;
  if (!loaded && !existsSync(plist)) return { changed: false, message: `no job installed: ${plist} does not exist` };
  if (loaded) io.launchctl(['bootout', `${target}/${label}`]);
  rmSync(plist, { force: true });
  return { changed: true, message: `removed: ${plist}` };
}

export function runnerCommand(args, lanes, io) {
  const commands = ['poll', 'status', 'install', 'uninstall'];
  if (args.length !== 1 || !commands.includes(args[0])) throw new Error('Usage: runner poll|status|install|uninstall');
  if (args[0] === 'poll') console.log(JSON.stringify(runnerPoll(lanes)));
  else if (args[0] === 'status') console.log(JSON.stringify({ ...runnerStatus(lanes), job: runnerJob(lanes, io) }));
  else console.log((args[0] === 'install' ? runnerInstall(lanes, io) : runnerUninstall(lanes, io)).message);
}
