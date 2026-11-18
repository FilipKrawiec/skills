import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { driveHeadlessArgs, driveSession, maxRuns } from '../../plugins/common/workflow/scripts/lib/drive.mjs';
import { runnerDefaults, runnerPoll, runnerStatus } from '../../plugins/common/workflow/scripts/lib/runner.mjs';

const lanes = { repo: 'acme/app' };
const T0 = Date.parse('2026-11-18T10:00:00Z');
const quotaOk = { remaining: 4000, limit: 5000, resetAt: '2026-11-18T11:00:00.000Z' };
const issues = [3, 4, 5, 6, 7, 8, 9, 10].map(number => ({ number, labels: [], body: '' }));

function setup(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'runner-'));
  const claims = join(root, 'claims');
  mkdirSync(claims);
  const logDirectory = join(root, 'logs');
  const world = { now: T0, started: [], terminated: [], living: new Set(), quota: quotaOk, issues, reads: 0, ...extra };
  const io = {
    now: () => world.now, sleep: () => {}, random: () => 0.5,
    probeQuota: () => world.quota,
    openIssues: () => { world.reads++; return world.issues; },
    dependencies: () => [],
    start: ({ id, now }) => { const pid = 1000 + world.started.length; world.started.push(id); world.living.add(pid); return { id, pid, startedAt: now, log: join(logDirectory, `session-${id}.log`) }; },
    alive: pid => world.living.has(pid),
    terminate: pid => world.terminated.push(pid),
  };
  const poll = () => runnerPoll(lanes, { io, logDirectory, claims, cwd: root });
  const claim = (session, issue, extra = {}) => writeFileSync(join(claims, `acme_app-${issue}.json`), JSON.stringify({ session, at: world.now, progressAt: world.now, ...extra }));
  const advance = ms => { world.now += ms; };
  return { world, poll, claim, advance, claims, logDirectory };
}
const lines = dir => readFileSync(join(dir, 'runner.log'), 'utf8').trim().split('\n');

test('the headless command takes its model and effort from drive and starts /deliver drive --next', () => {
  assert.deepEqual(driveHeadlessArgs(), ['-p', '--model', driveSession.model, '--effort', driveSession.effort, '--permission-mode', 'auto', '/deliver drive --next']);
});

test('idle: no ready work starts nothing and logs one line', () => {
  const t = setup({ issues: [] });
  const result = t.poll();
  assert.deepEqual(result.started, []);
  assert.equal(t.world.started.length, 0);
  assert.equal(lines(t.logDirectory).length, 1);
  assert.match(lines(t.logDirectory)[0], /ready=0 live=0 started=0 recovered=0 idle/);
});

test('ready work starts one session per poll, since drive --next admits one at a time', () => {
  const t = setup();
  const first = t.poll();
  assert.equal(first.started.length, 1);
  t.advance(runnerDefaults.minIntervalMs);
  assert.deepEqual(t.poll().started, [], 'the first has not claimed yet');
  assert.match(lines(t.logDirectory)[1], /next claim held/);
  t.claim(first.started[0], 'next');
  t.advance(runnerDefaults.minIntervalMs);
  assert.deepEqual(t.poll().started, [], 'a session holding only the next claim counts and blocks another');
});

test('every slot taken starts nothing and exits without reading issues', () => {
  const t = setup();
  for (let i = 0; i < maxRuns; i++) t.claim(`other-${i}`, 100 + i);
  const result = t.poll();
  assert.deepEqual(result.started, []);
  assert.equal(t.world.reads, 0);
  assert.match(lines(t.logDirectory)[0], /slots full/);
});

test('low GraphQL quota backs off before reading issues and logs the reset time', () => {
  const t = setup({ quota: { remaining: 500, limit: 5000, resetAt: '2026-11-18T10:40:00.000Z' } });
  const result = t.poll();
  assert.equal(result.backoff, true);
  assert.equal(t.world.reads, 0);
  assert.deepEqual(t.world.started, []);
  assert.match(lines(t.logDirectory)[0], /backoff until 2026-11-18T10:40:00.000Z/);
});

test('a poll within 60 s of the previous one is skipped; the next one runs', () => {
  const t = setup({ issues: [] });
  t.poll();
  t.advance(runnerDefaults.minIntervalMs - 1);
  assert.equal(t.poll().skipped, true);
  assert.equal(lines(t.logDirectory).length, 1);
  t.advance(1);
  assert.equal(t.poll().skipped, undefined);
});

test('a crashed session releases its claim so drive takes the issue again', () => {
  const t = setup({ issues: [] });
  t.world.issues = [issues[0]];
  const first = t.poll();
  const id = first.started[0];
  t.claim(id, 3);
  t.world.living.clear();
  t.advance(runnerDefaults.minIntervalMs);
  const second = t.poll();
  assert.deepEqual(second.recovered, [{ id, reason: 'crashed', issues: ['3'] }]);
  assert.equal(existsSync(join(t.claims, 'acme_app-3.json')), false);
  assert.match(lines(t.logDirectory).join('\n'), /recovered .* \(crashed\)/);
});

test('a hung session is terminated and its claim released; a progressing one is left alone', () => {
  const t = setup();
  const [a] = t.poll().started;
  t.claim(a, 3, { progressAt: T0 });
  t.advance(runnerDefaults.hangMs);
  const hung = t.poll();
  assert.deepEqual(hung.recovered.map(item => item.id), [a]);
  assert.equal(t.world.terminated.length, 1);
  assert.equal(existsSync(join(t.claims, 'acme_app-3.json')), false);
  const [b] = hung.started;
  t.claim(b, 4, { progressAt: T0 });
  t.advance(runnerDefaults.hangMs - 1000);
  t.claim(b, 4, { progressAt: t.world.now - 1000, at: t.world.now });
  assert.deepEqual(t.poll().recovered, []);
  assert.equal(existsSync(join(t.claims, 'acme_app-4.json')), true);
});

test('status reports health, sessions with their claimed issue, and the log path as JSON', () => {
  const t = setup();
  const [id] = t.poll().started;
  t.claim(id, 3);
  const status = runnerStatus(lanes, { logDirectory: t.logDirectory, claims: t.claims, now: T0 + 5000, isAlive: pid => t.world.living.has(pid) });
  assert.equal(status.lastPollAt, new Date(T0).toISOString());
  assert.equal(status.nextPollAt, new Date(T0 + runnerDefaults.minIntervalMs).toISOString());
  assert.deepEqual(status.quota, quotaOk);
  assert.equal(status.sessions[0].issue, '3');
  assert.equal(status.sessions[0].ageSeconds, 5);
  assert.equal(status.log, join(t.logDirectory, 'runner.log'));
});
