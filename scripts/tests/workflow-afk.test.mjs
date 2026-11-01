import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afkCandidates, afkEpicOrder, afkLive, afkLiveHolds, afkLoadEnvironment, afkOneShotLive, afkOtherHolds, afkPlan, afkPrRecord, afkPriority, afkShow, assertDistinctPushRoles, githubScopeFailure, missingProjectScope, validateIssueCommentBody, hasLockfAncestor, hasProcessAncestor, oneShotRunId, workflowDefaults, workflowLabels, workspaceFilePath, afkAgentEnvironment, afkWorkflowCliPath, afkPlistBelongsToWorkflow } from '../../plugins/common/workflow/scripts/workflow.mjs';

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

test('one-shot AFK runs are counted from live watcher PIDs', () => {
  assert.deepEqual(afkLive({}), []);
  const ledger = {
    live: [{ oneShot: true, watcherPid: 12 }],
    dead: [{ oneShot: true, watcherPid: 13 }],
    background: [{ oneShot: false, watcherPid: 12 }],
  };
  assert.deepEqual(afkOneShotLive(ledger, pid => pid === 12), ['live']);
});

test('workflow label catalog is centralized in the CLI', () => {
  assert.deepEqual(Object.keys(workflowLabels), [
    'lane:afk', 'lane:proposed', 'lane:owner', 'state:claimed', 'state:started',
    'review:owner', 'type:epic', 'type:story', 'type:bug', 'type:chore', 'type:task',
  ]);
});

test('AFK and explore use conventional defaults with four concurrent runs', () => {
  assert.equal(workflowDefaults.afk.maxRuns, 4);
  assert.match(workflowDefaults.afk.startCommand[0], /^pi$/);
  assert.equal(workflowDefaults.explore.personas, '.agents/personas.md');
});

test('macOS inherited-lock check survives truncated lockf command paths', () => {
  assert.equal(hasLockfAncestor(['lockf -t 300 /Users/filip/Developer/github.com/FilipKrawiec/stagely-pro/.git/workflow-locks/afk-start.lock /opt/homebrew/bin/node']), true);
  assert.equal(hasLockfAncestor(['/bin/bash -lc node workflow.mjs afk start']), false);
});

test('one-shot agent detects its watcher without requiring a lockf between them', () => {
  const processes = new Map([[10, { parent: 11 }], [11, { parent: 12 }]]);
  assert.equal(hasProcessAncestor(processes, 10, 12), true);
  assert.equal(hasProcessAncestor(processes, 10, 13), false);
});

test('one-shot end identifies its run even if the agent adds an irrelevant issue flag', () => {
  assert.equal(oneShotRunId('end', ['--me', 'run-1', '--issue', '2']), 'run-1');
  assert.equal(oneShotRunId('end', ['--me', 'run-1', '--me', 'run-2']), null);
  assert.equal(oneShotRunId('start', ['--me', 'run-1', '--issue', '2']), 'run-1');
});

test('quiet assignment output includes Hold so the one-shot watcher owns release', () => {
  const output = afkShow({ number: 2, epic: 1, paths: ['docs/a.md'], comment: 3 }, [{ issue: { number: 1 }, units: [{ issue: 2, text: '#2 is ready' }] }], [], true);
  assert.match(output, /^Hold: issue #2 in epic #1 \(comment 3\)/);
  assert.match(output, /Work: #2 is ready/);
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

test('AFK reports missing GitHub scopes without exposing API diagnostics', () => {
  const error = "gh: Your token has not been granted the required scopes to execute this query. The 'id' field requires one of the following scopes: ['read:project'], but your token has only been granted the: ['gist', 'read:org', 'repo', 'workflow']. Authorization: secret";
  assert.equal(githubScopeFailure(error), 'GitHub token is missing required scope(s): read:project; current token has: gist, read:org, repo, workflow.');
  const writeError = "gh: The 'updateProjectV2ItemFieldValue' field requires one of the following scopes: ['project'], but your token has only been granted the: ['read:project', 'repo']. Authorization: secret";
  assert.equal(githubScopeFailure(writeError), 'GitHub token is missing required scope(s): project; current token has: read:project, repo.');
  assert.equal(githubScopeFailure('error: your authentication token is missing required scopes [read:project]'), 'GitHub token is missing required scope(s): read:project.');
  assert.equal(githubScopeFailure('gh: API rate limit exceeded'), null);
  assert.equal(missingProjectScope(new Error(githubScopeFailure(error))), true);
  assert.equal(missingProjectScope(new Error(githubScopeFailure(writeError))), true);
  assert.equal(missingProjectScope(new Error('GitHub token is missing required scope(s): repo; current token has: gist.')), false);
});

test('issue comment bodies are bounded, non-empty text', () => {
  assert.equal(validateIssueCommentBody('Final report'), 'Final report');
  assert.throws(() => validateIssueCommentBody(' \n '), /1–60000 characters/);
  assert.throws(() => validateIssueCommentBody('x'.repeat(60_001)), /1–60000 characters/);
});

test('issue comment body files stay inside the worktree, including canonical symlink targets', t => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-comment-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'workflow-comment-outside-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  const insideFile = join(root, 'comment.md');
  const outsideFile = join(outside, 'secret.txt');
  writeFileSync(insideFile, 'Public report');
  writeFileSync(outsideFile, 'private secret');
  mkdirSync(join(root, 'folder'));
  symlinkSync(outsideFile, join(root, 'escape.md'));
  linkSync(outsideFile, join(root, 'hardlink.md'));
  assert.equal(workspaceFilePath(root, insideFile), realpathSync(insideFile));
  assert.throws(() => workspaceFilePath(root, outsideFile), /inside the current worktree/);
  assert.throws(() => workspaceFilePath(root, join(root, 'escape.md')), /inside the current worktree/);
  assert.throws(() => workspaceFilePath(root, join(root, 'hardlink.md')), /multiple hard links/);
  assert.throws(() => workspaceFilePath(root, join(root, 'folder')), /regular file/);
});

test('AFK runner does not inherit GitHub credentials or account selection', () => {
  const env = afkAgentEnvironment({ GH_TOKEN: 'secret', GITHUB_TOKEN: 'also-secret', GH_CONFIG_DIR: '/private/gh-agents', OLLAMA_HOST: 'http://localhost:11434', PATH: '/bin' });
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GH_CONFIG_DIR, undefined);
  assert.equal(env.OLLAMA_HOST, 'http://localhost:11434');
  assert.equal(env.PATH, '/bin');
});

test('watcher resolves the CLI that installed it without host plugin metadata', () => {
  assert.equal(afkWorkflowCliPath(), fileURLToPath(new URL('../../plugins/common/workflow/scripts/workflow.mjs', import.meta.url)));
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
