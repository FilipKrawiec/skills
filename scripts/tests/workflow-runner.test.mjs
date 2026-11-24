import './support/host-stubs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE_RED_MARKER, driveHeadlessArgs, driveSession, maxRuns, nextTargets } from '../../plugins/common/workflow/scripts/lib/drive.mjs';
import { runnerDefaults, runnerInstall, runnerJob, runnerPoll, runnerStatus, runnerUninstall } from '../../plugins/common/workflow/scripts/lib/runner.mjs';

const lanes = { repo: 'acme/app', owner: 'owner' };
const T0 = Date.parse('2026-11-18T10:00:00Z');
const quotaOk = { remaining: 4000, limit: 5000, resetAt: '2026-11-18T11:00:00.000Z' };
const issues = [3, 4, 5, 6, 7, 8, 9, 10].map(number => ({ number, labels: [], body: '', author: { login: 'owner' } }));

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
    subIssues: n => (world.subs?.[n] ?? []).map(number => ({ number, state: 'OPEN' })),
    ownerApproved: () => !!world.ownerApproved,
    ownerWaiting: issue => world.ownerWaiting?.(issue) ?? false,
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

test('a runner session id is a UUID that also names the Claude session, so its transcript can be found', () => {
  const t = setup();
  const [id] = t.poll().started;
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(driveHeadlessArgs(id).slice(0, 3), ['-p', '--session-id', id]);
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

test('an outsider issue is not ready work: only the trusted issue starts', () => {
  const t = setup({ issues: [{ number: 2, labels: [], body: '', author: { login: 'stranger' } }, { number: 3, labels: [], body: '', author: { login: 'owner' } }] });
  t.poll();
  assert.equal(t.world.started.length, 1);
  assert.match(lines(t.logDirectory)[0], /ready=1 /);
  const approved = setup({ issues: [{ number: 2, labels: [], body: '', author: { login: 'stranger' } }], ownerApproved: true });
  approved.poll();
  assert.equal(approved.world.started.length, 1, 'an owner-approved outsider issue is ready');
  const only = setup({ issues: [{ number: 2, labels: [], body: '', author: { login: 'stranger' } }] });
  assert.deepEqual(only.poll().started, []);
  assert.match(lines(only.logDirectory)[0], /ready=0 live=0 started=0 recovered=0 idle/);
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
  assert.equal(status.sessions[0].logFile, join(t.logDirectory, `session-${id}.log`));
  assert.equal(status.log, join(t.logDirectory, 'runner.log'));
});

// launchd job: a fake launchctl and git, and a temporary home
function launchd(t, extra = {}) {
  const home = mkdtempSync(join(tmpdir(), 'launchd-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const world = { loaded: false, calls: [], clones: [], ...extra };
  const io = {
    home, uid: 501, nodePath: '/usr/local/bin/node', repoRoot: '/work/app',
    launchctl: args => {
      world.calls.push(args.join(' '));
      if (args[0] === 'print') return { status: world.loaded ? 0 : 113 };
      if (args[0] === 'bootstrap') world.loaded = true;
      if (args[0] === 'bootout') world.loaded = false;
      return { status: 0 };
    },
    clone: (url, dir) => { world.clones.push(url); mkdirSync(join(dir, '.git'), { recursive: true }); },
  };
  const plist = join(home, 'Library', 'LaunchAgents', 'com.filipkrawiec.workflow-runner.acme-app.plist');
  return { world, io, home, plist, install: () => runnerInstall(lanes, io), uninstall: () => runnerUninstall(lanes, io) };
}

test('install writes a per-repo plist, clones the tooling once and bootstraps it', t => {
  const l = launchd(t);
  const result = l.install();
  assert.equal(result.changed, true);
  const text = readFileSync(l.plist, 'utf8');
  assert.match(text, /<string>com\.filipkrawiec\.workflow-runner\.acme-app<\/string>/);
  assert.match(text, /<key>WorkingDirectory<\/key>\s*<string>\/work\/app<\/string>/);
  assert.match(text, new RegExp(`<string>${l.home}/Library/Logs/workflow-runner/acme-app/launchd\\.out\\.log</string>`));
  assert.match(text, new RegExp(`<string>${l.home}/Library/Logs/workflow-runner/acme-app/launchd\\.err\\.log</string>`));
  assert.ok(Number(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/.exec(text)[1]) >= 60);
  assert.match(text, new RegExp(`<key>PATH</key>\\s*<string>[^<]*${l.home}/\\.local/bin[:<]`));
  assert.match(text, /merge --ff-only/);
  assert.match(text, /runner poll/);
  assert.equal(l.world.clones.length, 1);
  assert.ok(l.world.calls.includes(`bootstrap gui/501 ${l.plist}`));
  assert.equal(l.world.loaded, true);
});

test('a second install with unchanged inputs changes nothing and says so', t => {
  const l = launchd(t);
  l.install();
  l.world.calls.length = 0;
  const again = l.install();
  assert.equal(again.changed, false);
  assert.match(again.message, /unchanged/);
  assert.equal(l.world.clones.length, 1);
  assert.deepEqual(l.world.calls.filter(call => !call.startsWith('print')), []);
});

test('changed inputs rewrite the plist and reload the job', t => {
  const l = launchd(t);
  l.install();
  l.world.calls.length = 0;
  l.io.nodePath = '/opt/node/bin/node';
  assert.equal(l.install().changed, true);
  assert.match(readFileSync(l.plist, 'utf8'), /\/opt\/node\/bin\/node/);
  const order = l.world.calls.filter(call => !call.startsWith('print')).map(call => call.split(' ')[0]);
  assert.deepEqual(order, ['bootout', 'bootstrap']);
});

test('an unloaded but unchanged job is bootstrapped again', t => {
  const l = launchd(t);
  l.install();
  l.world.loaded = false;
  assert.equal(l.install().changed, true);
  assert.equal(l.world.loaded, true);
});

test('uninstall boots the job out and removes the plist; with none installed it says so', t => {
  const l = launchd(t);
  l.install();
  assert.match(l.uninstall().message, /removed/);
  assert.equal(existsSync(l.plist), false);
  assert.equal(l.world.loaded, false);
  const none = l.uninstall();
  assert.equal(none.changed, false);
  assert.match(none.message, /no job installed/);
});

test('status reports whether the job is installed and loaded', t => {
  const l = launchd(t);
  assert.deepEqual(runnerJob(lanes, l.io), { installed: false, loaded: false, plist: l.plist });
  l.install();
  assert.deepEqual(runnerJob(lanes, l.io), { installed: true, loaded: true, plist: l.plist });
});

test('two simultaneous polls: the second finds the lock and does nothing', t => {
  const x = setup({ issues: [] });
  mkdirSync(x.logDirectory, { recursive: true });
  writeFileSync(join(x.logDirectory, 'poll.lock'), String(process.pid));
  const result = x.poll();
  assert.equal(result.locked, true);
  assert.equal(x.world.reads, 0);
  writeFileSync(join(x.logDirectory, 'poll.lock'), '');
  assert.equal(x.poll().locked, true, 'a lock its holder has created but not yet filled is held, not taken over');
  writeFileSync(join(x.logDirectory, 'poll.lock'), '999999999');
  assert.equal(x.poll().locked, undefined, 'a lock held by a dead process is taken over');
  assert.equal(existsSync(join(x.logDirectory, 'poll.lock')), false, 'released after the poll');
});

test('the poll asks which issues already wait on the owner so ready ones rank first', () => {
  const asked = [];
  const t = setup({ issues: [{ number: 3, labels: [{ name: 'state:started' }], body: '', author: { login: 'owner' } }, { number: 4, labels: [], body: '', author: { login: 'owner' } }], ownerWaiting: issue => { asked.push(issue.number); return issue.number === 3; } });
  assert.equal(t.poll().started.length, 1);
  assert.deepEqual(asked.sort(), [3, 4]);
});

test('the poll takes the same first issue as drive --next for the same input', () => {
  const owned = (number, labels, body = '') => ({ number, labels, body, author: { login: 'owner' } });
  const mixed = [owned(3, []), owned(4, [{ name: 'type:bug' }]), owned(5, [], BASE_RED_MARKER)];
  const asked = [];
  const first = nextTargets(mixed).next().value;
  const root = mkdtempSync(join(tmpdir(), 'runner-'));
  mkdirSync(join(root, 'claims'));
  const io = { now: () => T0, sleep: () => {}, random: () => 0.5, probeQuota: () => quotaOk, openIssues: () => mixed, dependencies: issue => { asked.push(issue.number); return []; }, ownerApproved: () => false, ownerWaiting: () => false, start: ({ id, now }) => ({ id, pid: 1, startedAt: now, log: join(root, 'log') }), alive: () => true, terminate: () => {} };
  assert.equal(runnerPoll(lanes, { io, logDirectory: join(root, 'logs'), claims: join(root, 'claims'), cwd: root }).started.length, 1);
  assert.equal(first, 5);
  assert.equal(asked[0], first, 'the runner reads the dependencies of drive --next\'s first pick first');
});

test('the poll takes an epic, not its slices, and starts nothing while a live session holds the epic or any of its slices', () => {
  const owned = (number, labels = []) => ({ number, labels: labels.map(name => ({ name })), body: '', author: { login: 'owner' } });
  const setupEpic = () => setup({ issues: [owned(3, ['type:epic']), owned(4)], subs: { 3: [4] } });
  const free = setupEpic();
  assert.equal(free.poll().started.length, 1, 'the epic is ready, so a session starts');
  for (const held of [3, 4]) {
    const t = setupEpic();
    t.claim('other-session', held);
    const result = t.poll();
    assert.equal(result.started.length, 0, `a live claim on #${held} starts no second session for the epic`);
    assert.equal(t.world.started.length, 0);
  }
});

test('the poll reads an epic\'s sub-issues once, however often ranking and the claim check ask', () => {
  const asked = [];
  const epic = { number: 5, labels: [{ name: 'type:epic' }], body: '', author: { login: 'owner' } };
  const slice = { number: 6, labels: [], body: '', author: { login: 'owner' } };
  const t = setup({ issues: [epic, slice], subs: { 5: [6] } });
  const poll = t.poll;
  const original = t.world.subs;
  t.world.subs = new Proxy(original, { get: (target, key) => { asked.push(key); return target[key]; } });
  poll();
  assert.equal(asked.filter(key => key === '5').length, 1);
});
