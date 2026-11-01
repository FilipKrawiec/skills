import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afkCandidates, afkEpicOrder, afkLiveHolds, afkLoadEnvironment, afkOtherHolds, afkPlan, afkPrRecord, afkPriority, assertDistinctPushRoles, selectInstalledPlugin, resolveInstalledPluginCli, afkPlistBelongsToWorkflow } from '../../plugins/common/workflow/scripts/workflow.mjs';

const cfg = { repo: 'acme/app', reviewer: 'reviewer', owner: 'owner' };
const epic = { number: 1, labels: ['type:epic'], ancestors: [], priority: 1 };
function issue(number, labels, extra = {}) {
  return { number, labels, ancestors: [1], blocked: false, paths: [`src/${number}.js`], priority: 2, ...extra };
}

test('AFK plan skips live claims but lets a new run take a stale claim', () => {
  const issues = [epic, issue(2, ['lane:afk']), issue(3, ['lane:afk']), issue(4, ['lane:afk'])];
  const comments = new Map([
    [3, [{ body: '<!-- afk-claim session=live-run -->' }]],
    [4, [{ body: '<!-- afk-claim session=finished-run -->' }]],
  ]);
  const plan = afkPlan(cfg, ['live-run'], number => comments.get(number) || [], 'new-run', { issues, prs: [] });
  assert.deepEqual(plan.epics[0].units.map(unit => unit.issue), [2, 4]);
});

test('AFK plan keeps unreviewed proposals in the eligibility queue', () => {
  const proposed = issue(5, ['lane:proposed'], { lastEditedAt: '2026-10-01T00:00:00Z' });
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, proposed], prs: [] });
  assert.match(plan.epics[0].units[0].text, /awaits its AFK eligibility check/);
});

test('a Reviewer approval applies only to the exact head and verdict', () => {
  const pr = { number: 7, title: 'Update', body: 'Issue #8', headRefOid: 'head', labels: [], statusCheckRollup: [], reviews: [
    { author: { login: 'reviewer' }, state: 'APPROVED', commit: { oid: 'old' }, body: '<!-- agent-review sha=old verdict=ready -->' },
  ] };
  const record = afkPrRecord(pr, cfg);
  assert.equal(record.approved, false);
  assert.equal(record.awaitingReview, true);
});

test('candidate selection honors live holds and work sharing', () => {
  const epics = [{ issue: { number: 1 }, units: [
    { issue: 2, paths: ['src/2.js'] }, { issue: 3, paths: ['src/3.js'] },
  ] }];
  const held = [...afkCandidates(epics, [{ number: 2, epic: 1, paths: ['src/2.js'] }], true, () => false)];
  assert.deepEqual(held.map(item => item.number), [3]);
  assert.deepEqual([...afkCandidates(epics, [], true, () => true)], []);
});

test('epics are ordered by priority, milestone and number', () => {
  const epics = [
    { number: 3, priority: 'P1', milestone: { number: 4, dueOn: '2026-12-01' } },
    { number: 2, priority: 'P0' },
    { number: 1, priority: 'P1', milestone: { number: 2, dueOn: '2026-11-01' } },
  ];
  epics.sort(afkEpicOrder);
  assert.deepEqual(epics.map(item => item.number), [2, 1, 3]);
  assert.equal(afkPriority('P2'), 2);
  assert.equal(afkPriority('unknown'), 9);
});

test('holds retain only the current run and other live runs', () => {
  const comments = [
    { id: 1, body: '<!-- afk-issue-hold session=finished -->' },
    { id: 2, body: '<!-- afk-epic-hold session=live -->' },
    { id: 3, body: '<!-- afk-issue-hold session=mine -->' },
  ];
  assert.deepEqual(afkLiveHolds(comments, ['live'], 'mine').map(hold => hold.run), ['live', 'mine']);
});

test('dead run holds expire after the grace period while live holds persist', () => {
  const ledger = {
    live: [{ number: 2, epic: 1, paths: ['src/2.js'], gone: 1 }],
    dead: [{ number: 3, epic: 1, paths: ['src/3.js'], gone: 10 }],
  };
  const holds = afkOtherHolds(ledger, ['live'], 'new', 600_011);
  assert.deepEqual(holds.map(hold => hold.number), [2]);
  assert.equal('dead' in ledger, false);
});

test('a checked proposed issue waits for a changed issue before rechecking', () => {
  const proposed = issue(6, ['lane:proposed'], { lastEditedAt: '2026-10-01T00:00:00Z' });
  const comments = [{ user: { login: 'reviewer' }, created_at: '2026-10-02T00:00:00Z', body: '<!-- agent-review eligibility issue=6 -->' }];
  const plan = afkPlan(cfg, [], number => number === 6 ? comments : [], 'new-run', { issues: [epic, proposed], prs: [] });
  assert.deepEqual(plan.epics[0].units, []);
});

test('AFK imports the configured gh profile without importing git overrides', t => {
  const directory = mkdtempSync(join(tmpdir(), 'afk-env-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'settings.json');
  writeFileSync(file, JSON.stringify({ env: { GH_CONFIG_DIR: join(directory, 'bot-gh'), GIT_CONFIG_COUNT: '1' } }));
  const previousGh = process.env.GH_CONFIG_DIR, previousGit = process.env.GIT_CONFIG_COUNT;
  t.after(() => {
    if (previousGh === undefined) delete process.env.GH_CONFIG_DIR; else process.env.GH_CONFIG_DIR = previousGh;
    if (previousGit === undefined) delete process.env.GIT_CONFIG_COUNT; else process.env.GIT_CONFIG_COUNT = previousGit;
  });
  process.env.GIT_CONFIG_COUNT = '9';
  afkLoadEnvironment({ environmentFile: file });
  assert.equal(process.env.GH_CONFIG_DIR, join(directory, 'bot-gh'));
  assert.equal(process.env.GIT_CONFIG_COUNT, undefined);
});

test('push roles require owner, implementer and reviewer to be distinct', () => {
  assert.doesNotThrow(() => assertDistinctPushRoles({ owner: 'owner', implementer: 'builder', reviewer: 'reviewer' }));
  assert.throws(() => assertDistinctPushRoles({ owner: 'reviewer', implementer: 'builder', reviewer: 'Reviewer' }), /distinct/);
});

test('watcher plugin resolution prefers its project scope over a newer user scope', () => {
  const entries = [
    { scope: 'user', installPath: '/plugins/user', lastUpdated: '2026-11-01T12:00:00Z' },
    { scope: 'project', projectPath: '/repo/.worktrees/afk-watch', installPath: '/plugins/project', lastUpdated: '2026-10-01T12:00:00Z' },
  ];
  assert.equal(selectInstalledPlugin(entries, '/repo/.worktrees/afk-watch').installPath, '/plugins/project');
  assert.equal(selectInstalledPlugin(entries, '/other/repo').installPath, '/plugins/user');
  assert.equal(selectInstalledPlugin([entries[1]], '/other/repo'), null);
  assert.throws(() => resolveInstalledPluginCli(entries, '/repo/.worktrees/afk-watch', path => path !== '/plugins/project/scripts/workflow.mjs'), /--scope project/);
  assert.equal(resolveInstalledPluginCli(entries, '/other/repo', () => true), '/plugins/user/scripts/workflow.mjs');
});

test('launchd ownership check accepts only this watcher or the same-repo legacy recipe', () => {
  const owned = '<key>Label</key><string>com.example.watch</string><key>ProgramArguments</key><array><string>/usr/bin/node</string><string>/repo/.git/afk-launch.mjs</string><string>afk</string><string>watch</string></array><key>WorkingDirectory</key><string>/repo/.worktrees/afk-watch</string>';
  const legacy = '<key>Label</key><string>com.example.watch</string><key>ProgramArguments</key><array><string>/opt/homebrew/bin/just</string><string>afk-watch</string></array><key>WorkingDirectory</key><string>/repo</string>';
  const other = legacy.replace('afk-watch', 'unrelated-job');
  const identity = { label: 'com.example.watch', launcher: '/repo/.git/afk-launch.mjs', executable: '/usr/bin/node', watchDirectory: '/repo/.worktrees/afk-watch', repositoryRoot: '/repo' };
  assert.equal(afkPlistBelongsToWorkflow(owned, identity), true);
  assert.equal(afkPlistBelongsToWorkflow(legacy, { ...identity, allowLegacy: true }), true);
  assert.equal(afkPlistBelongsToWorkflow(legacy, identity), false);
  assert.equal(afkPlistBelongsToWorkflow(other, { ...identity, allowLegacy: true }), false);
  assert.equal(afkPlistBelongsToWorkflow(owned.replace('/usr/bin/node', '/usr/bin/python3'), identity), false);
  assert.equal(afkPlistBelongsToWorkflow(owned.replace('/repo/.worktrees/afk-watch', '/tmp/other'), identity), false);
  assert.equal(afkPlistBelongsToWorkflow(owned.replace('</array>', '<string>--unexpected</string></array>'), identity), false);
  assert.equal(afkPlistBelongsToWorkflow(legacy.replace('</array>', '<string>--unexpected</string></array>'), { ...identity, allowLegacy: true }), false);
});
