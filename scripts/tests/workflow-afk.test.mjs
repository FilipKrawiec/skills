import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afkCandidates, afkEpicOrder, afkLive, afkLiveHolds, afkLoadEnvironment, afkOneShotLive, afkOtherHolds, afkPlan, afkPrRecord, afkPriority, afkReviewerApproved, afkShow, afkPathsFromIssueBody, applyGithubMetadata, assertDistinctPushRoles, githubRepoFromRemote, githubScopeFailure, missingProjectScope, readThroughLocalCache, validateIssueCommentBody, hasLockfAncestor, hasProcessAncestor, oneShotRunId, workflowDefaults, workflowLabels, workflowMetadataCachePath, workspaceFilePath, afkAgentEnvironment, afkPathsWithinScope, afkWorkflowCliPath, afkDefaultStartCommand, afkReleaseRunTree, afkPlistBelongsToWorkflow, afkPluginDir, afkEnsureTooling, afkLauncherSource, githubPushRemoteMatches, needsAbsoluteInvocation, afkRunUsage, afkSweepRunTrees, afkRunAlive, afkExcludeWorktrees, issueTargetRepo, oldestExactTitle, assertIssueVisibility } from '../../plugins/common/workflow/scripts/workflow.mjs';

const cfg = { repo: 'acme/app', reviewer: 'reviewer', owner: 'owner' };

test('AFK close denies changed paths outside the assigned scope', () => {
  assert.equal(afkPathsWithinScope(['docs/a.md'], ['docs/']), true);
  assert.equal(afkPathsWithinScope(['.captures-886/a.jpeg'], ['docs/']), false);
  assert.equal(afkPathsWithinScope(['docs/read-only.md'], []), false);
  assert.equal(afkPathsWithinScope([], []), true);
  assert.equal(afkPathsWithinScope([], null), true);
  assert.equal(afkPathsWithinScope(['src/app.dart'], null), true);
});

test('AFK scope makes explicit no-repository-change constraints read-only', () => {
  assert.deepEqual(afkPathsFromIssueBody('Make no repository changes, commits, PRs, deployments.'), []);
  assert.deepEqual(afkPathsFromIssueBody('```scope\n{"paths":["docs/"]}\n```'), ['docs/']);
  assert.equal(afkPathsFromIssueBody('no valid packet'), null);
});

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

test('one-shot AFK runs are counted from live watcher PIDs', t => {
  const outside = mkdtempSync(join(tmpdir(), 'afk-live-'));
  const previous = process.cwd();
  t.after(() => { process.chdir(previous); rmSync(outside, { recursive: true, force: true }); });
  process.chdir(outside);
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
  assert.deepEqual(workflowDefaults.afk.startCommand, ['claude', '--print', '--output-format', 'json', '--plugin-dir', '{pluginDir}', '--name', '{runId}', '--worktree', '{runId}', '--permission-mode', '{permissionMode}', '{prompt}']);
  assert.equal(workflowDefaults.afk.toolingRepository, 'https://github.com/FilipKrawiec/skills.git');
  assert.equal(workflowDefaults.afk.toolingRef, 'main');
  assert.equal(workflowDefaults.afk.toolingDirectory, '~/.local/share/workflow-cli/skills');
  assert.equal(workflowDefaults.afk.permissionMode, 'auto');
  assert.equal(workflowDefaults.explore.personas, '.agents/personas.md');
});

test('repository and base metadata come from the Git remote and origin HEAD', () => {
  assert.equal(githubRepoFromRemote('https://github.com/acme/stage.git'), 'acme/stage');
  assert.equal(githubRepoFromRemote('git@github.com:acme/stage.git'), 'acme/stage');
  assert.throws(() => githubRepoFromRemote('https://example.com/acme/stage.git'), /GitHub/);
});

test('GitHub metadata cache is shared by a caller-supplied common git directory', t => {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-cache-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = workflowMetadataCachePath(directory);
  let calls = 0;
  const loader = () => { calls++; return { project: { number: 5, owner: 'acme-projects' }, reviewQueue: 479 }; };
  const options = { expectedFields: ['project', 'reviewQueue'] };
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', loader, { ...options, now: 1_000 }), { project: { number: 5, owner: 'acme-projects' }, reviewQueue: 479 });
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', loader, { ...options, now: 2_000 }), { project: { number: 5, owner: 'acme-projects' }, reviewQueue: 479 });
  assert.equal(calls, 1);
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', loader, { ...options, now: 2_000, refresh: true }), { project: { number: 5, owner: 'acme-projects' }, reviewQueue: 479 });
  assert.equal(calls, 2);
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', () => ({ reviewQueue: 480 }), { ...options, now: 3_000, refresh: true }), { project: { number: 5, owner: 'acme-projects' }, reviewQueue: 480 });
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', () => ({ reviewQueue: 481 }), { ...options, now: 100_000, ttlMs: 10 }), { reviewQueue: 481 });
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', () => ({ project: null }), { ...options, now: 100_001, ttlMs: 10 }), { project: null, reviewQueue: 481 });
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', () => ({ reviewQueue: 482 }), { ...options, now: 200_000, ttlMs: 10 }), { reviewQueue: 482 });
});

test('cached GitHub facts fill optional workflow settings without overriding explicit policy', () => {
  const cfg = { project: null, reviewQueue: 123 };
  assert.deepEqual(applyGithubMetadata(cfg, { project: { number: 5 }, reviewQueue: 479 }), { project: { number: 5 }, reviewQueue: 123 });
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

test('a Reviewer thread reply after an approval keeps the approval, a change request does not', () => {
  const approval = { author: { login: 'reviewer' }, state: 'APPROVED', commit: { oid: 'head' }, body: '<!-- agent-review sha=head verdict=ready -->' };
  const reply = { author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'head' }, body: '' };
  const fixes = { author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', commit: { oid: 'head' }, body: '<!-- agent-review sha=head verdict=fixes -->' };
  const pr = reviews => ({ number: 7, title: 'Update', body: 'Issue #8', headRefOid: 'head', labels: [], statusCheckRollup: [], reviews });
  assert.equal(afkReviewerApproved(pr([approval, reply]), cfg), true);
  assert.equal(afkReviewerApproved(pr([approval, { ...reply, body: 'Fixed as agent-review asked.' }]), cfg), true);
  assert.equal(afkPrRecord(pr([approval, reply]), cfg).approved, true);
  assert.equal(afkReviewerApproved(pr([approval, fixes]), cfg), false);
  assert.equal(afkReviewerApproved(pr([approval, { ...fixes, body: '' }]), cfg), false);
  assert.equal(afkPrRecord(pr([approval, reply, fixes]), cfg).approved, false);
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

test('a proposed issue a run already checked waits for a change, whoever posted the verdict', () => {
  const proposed = issue(6, ['lane:proposed'], { lastEditedAt: '2026-10-01T00:00:00Z' });
  // A release edits the hold comment in place, so it keeps the hold's creation time.
  const comments = [
    { user: { login: 'builder' }, created_at: '2026-10-02T00:00:00Z', body: '<!-- afk-issue-released session=run-1 -->\nUsage: 3 turns' },
    { user: { login: 'builder' }, created_at: '2026-10-02T00:01:00Z', body: '<!-- agent-review eligibility issue=6 verdict=REQUEST_CHANGES -->\nThe cause is not traced.' },
    { user: { login: 'builder' }, created_at: '2026-10-02T00:03:00Z', body: '<!-- afk-issue-released session=run-2 -->\nStart failed; hold released.' },
  ];
  const plan = (list, edited = '2026-10-01T00:00:00Z') => afkPlan({ ...cfg, implementer: 'builder' }, [], number => number === 6 ? list : [], 'new-run', { issues: [epic, { ...proposed, lastEditedAt: edited }], prs: [] }).epics[0].units;
  assert.deepEqual(plan(comments), []);
  assert.equal(plan([...comments, { user: { login: 'owner' }, created_at: '2026-10-03T00:00:00Z', body: 'Traced the cause.' }]).length, 1);
  assert.equal(plan(comments, '2026-10-03T00:00:00Z').length, 1);
  assert.equal(plan([comments[0], comments[2]]).length, 1, 'a run that ended without a verdict leaves the issue queued');
  assert.equal(plan(comments.map(comment => ({ ...comment, user: { login: 'stranger' } }))).length, 1, 'only the implementer or Reviewer records a verdict');
});

test('a Blocked card stays out of selection until it moves back to Todo', () => {
  const ready = status => afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, issue(7, ['lane:afk'], { status })], prs: [] }).epics[0].units;
  assert.deepEqual(ready('Blocked'), []);
  assert.equal(ready('Todo').length, 1);
  assert.equal(ready(null).length, 1);
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
  const env = afkAgentEnvironment({ GH_TOKEN: 'secret', GITHUB_TOKEN: 'also-secret', GH_CONFIG_DIR: '/private/gh-agents', SSH_AUTH_SOCK: '/private/ssh-agent', SSH_AGENT_PID: '1234', OLLAMA_HOST: 'http://localhost:11434', PATH: '/bin' });
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GH_CONFIG_DIR, undefined);
  assert.equal(env.SSH_AUTH_SOCK, undefined);
  assert.equal(env.SSH_AGENT_PID, undefined);
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

test('runs load the plugins shipped next to the running CLI', () => {
  assert.equal(afkPluginDir('/tools/skills/plugins/common/workflow/scripts/workflow.mjs'), '/tools/skills/plugins/common');
});

const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_CONFIG_/.test(key)));
function gitIn(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...gitEnv, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function publish(origin, version) {
  const cli = join(origin, 'plugins', 'common', 'workflow', 'scripts');
  mkdirSync(cli, { recursive: true });
  writeFileSync(join(cli, 'workflow.mjs'), `console.log('v${version}', process.argv.slice(2).join(' '));\n`);
  gitIn(origin, 'add', '-A'); gitIn(origin, 'commit', '--quiet', '-m', `v${version}`);
}

test('the watcher launcher keeps its own tooling checkout on the latest release', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tooling-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, 'origin'); mkdirSync(origin);
  gitIn(origin, 'init', '--quiet', '--initial-branch', 'main');
  publish(origin, 1);
  const tooling = join(root, 'tooling');
  afkEnsureTooling(tooling, origin, 'main');
  assert.equal(gitIn(tooling, 'rev-parse', 'HEAD'), gitIn(origin, 'rev-parse', 'HEAD'));
  const launcher = join(root, 'launch.mjs');
  writeFileSync(launcher, afkLauncherSource({ toolingDirectory: tooling, ref: 'main' }));
  const launch = () => spawnSync(process.execPath, [launcher, 'afk', 'watch'], { encoding: 'utf8', env: gitEnv });

  assert.match(launch().stdout, /^v1 afk watch/);
  publish(origin, 2);
  assert.match(launch().stdout, /^v2 afk watch/);

  writeFileSync(join(tooling, 'plugins', 'common', 'workflow', 'scripts', 'workflow.mjs'), "console.log('local');\n");
  publish(origin, 3);
  const dirty = launch();
  assert.match(dirty.stdout, /^local/);
  assert.match(dirty.stderr, /local changes/);

  assert.throws(() => afkEnsureTooling(tooling, origin, 'main'), /local changes/);
  const stranger = join(root, 'stranger'); mkdirSync(stranger);
  writeFileSync(join(stranger, 'file'), 'x');
  assert.throws(() => afkEnsureTooling(stranger, origin, 'main'), /not a Git checkout/);
});

test('AFK accepts the same HTTPS or SSH GitHub push remotes as push', () => {
  assert.equal(githubPushRemoteMatches('https://github.com/Acme/App.git', 'acme/app'), true);
  assert.equal(githubPushRemoteMatches('git@github.com:acme/app.git', 'acme/app'), true);
  assert.equal(githubPushRemoteMatches('git@github.com:acme/other.git', 'acme/app'), false);
  assert.equal(githubPushRemoteMatches('https://example.com/acme/app.git', 'acme/app'), false);
});

test('a relative CLI invocation re-executes by absolute path so lock owners match', () => {
  assert.equal(needsAbsoluteInvocation('plugins/common/workflow/scripts/workflow.mjs', '/r/plugins/common/workflow/scripts/workflow.mjs'), true);
  assert.equal(needsAbsoluteInvocation('/r/plugins/common/workflow/scripts/workflow.mjs', '/r/plugins/common/workflow/scripts/workflow.mjs'), false);
});

test('AFK default runner command takes a configured model', () => {
  assert.deepEqual(afkDefaultStartCommand(undefined), workflowDefaults.afk.startCommand);
  assert.deepEqual(afkDefaultStartCommand('sonnet').slice(0, 4), ['claude', '--print', '--model', '{model}']);
  assert.equal(afkDefaultStartCommand('sonnet').length, workflowDefaults.afk.startCommand.length + 2);
});

test('AFK keeps a run worktree only while it holds work missing from the remote', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'afk-run-tree-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(git(root, 'init', '-q', '-b', 'main', repo).status, 0);
  assert.equal(git(repo, 'commit', '-q', '--allow-empty', '-m', 'base').status, 0);
  assert.equal(git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD').status, 0);
  const tree = name => { const path = join(root, name); assert.equal(git(repo, 'worktree', 'add', '-q', '--detach', path, 'origin/main').status, 0); return path; };
  const clean = tree('clean');
  assert.equal(afkReleaseRunTree(clean, repo), true);
  const dirty = tree('dirty');
  writeFileSync(join(dirty, 'work.txt'), 'unsaved');
  assert.equal(afkReleaseRunTree(dirty, repo), false);
  const committed = tree('committed');
  assert.equal(git(committed, 'commit', '-q', '--allow-empty', '-m', 'local only').status, 0);
  assert.equal(afkReleaseRunTree(committed, repo), false);
});

test('AFK removes a finished run worktree and the branch Claude Code made for it, and sweeps those of ended runs', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'afk-native-tree-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(git(root, 'init', '-q', '-b', 'main', repo).status, 0);
  assert.equal(git(repo, 'commit', '-q', '--allow-empty', '-m', 'base').status, 0);
  assert.equal(git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD').status, 0);
  const native = name => {
    const path = join(repo, '.claude', 'worktrees', name);
    assert.equal(git(repo, 'worktree', 'add', '-q', '--lock', '-b', `worktree-${name}`, path, 'origin/main').status, 0);
    return path;
  };
  const finished = native('afk-20261102101500-111-1');
  assert.equal(afkReleaseRunTree(finished, repo), true);
  assert.equal(existsSync(finished), false);
  assert.equal(git(repo, 'rev-parse', '--verify', '-q', 'refs/heads/worktree-afk-20261102101500-111-1').status, 1);
  const ended = native('afk-20261102101600-222-1');
  const running = native('afk-20261102101600-333-1');
  const stranded = native('afk-20261102101600-444-1');
  writeFileSync(join(stranded, 'work.txt'), 'unsaved');
  const logs = [];
  t.mock.method(console, 'log', message => logs.push(message));
  afkSweepRunTrees({ runPrefix: 'afk-' }, repo, pid => pid === 333);
  assert.equal(existsSync(ended), false);
  assert.equal(existsSync(running), true);
  assert.equal(existsSync(stranded), true);
  assert.deepEqual(logs, [`Kept: ${stranded} holds work that is not on the remote; preserve it.`]);
});

test('AFK counts a run live while its watcher or its supervisor is', t => {
  const common = mkdtempSync(join(tmpdir(), 'afk-alive-'));
  t.after(() => rmSync(common, { recursive: true, force: true }));
  mkdirSync(join(common, 'afk-runs'));
  const job = (name, value) => writeFileSync(join(common, 'afk-runs', `${name}.json`), JSON.stringify(value));
  const alive = pid => pid === 7;
  assert.equal(afkRunAlive(common, 7, 'watched', alive), true);
  job('supervised', { pid: 7 });
  assert.equal(afkRunAlive(common, 8, 'supervised', alive), true);
  job('unrecorded', {});
  assert.equal(afkRunAlive(common, 8, 'unrecorded', alive), false);
  assert.equal(existsSync(join(common, 'afk-runs', 'unrecorded.json')), false);
  job('ended', { pid: 9 });
  assert.equal(afkRunAlive(common, 8, 'ended', alive), false);
  assert.equal(existsSync(join(common, 'afk-runs', 'ended.json')), false);
  assert.equal(afkRunAlive(common, 8, 'unknown', alive), false);
});

test('AFK keeps watcher and run worktrees out of the main checkout status once', t => {
  const common = mkdtempSync(join(tmpdir(), 'afk-exclude-'));
  t.after(() => rmSync(common, { recursive: true, force: true }));
  mkdirSync(join(common, 'info'));
  writeFileSync(join(common, 'info', 'exclude'), '*.log');
  afkExcludeWorktrees(common);
  afkExcludeWorktrees(common);
  assert.equal(readFileSync(join(common, 'info', 'exclude'), 'utf8'), '*.log\n/.worktrees/\n/.claude/worktrees/\n');
});

test('AFK run usage summarizes a JSON runner result and ignores plain output', () => {
  const output = JSON.stringify({ type: 'result', result: 'Summary: done', total_cost_usd: 1.234, num_turns: 42, duration_ms: 754_000, usage: { input_tokens: 1200, output_tokens: 3400, cache_read_input_tokens: 560000, cache_creation_input_tokens: 78000 } });
  assert.deepEqual(afkRunUsage(output), { result: 'Summary: done', line: 'Usage: $1.23, 42 turns, 13 min, tokens in 1200, out 3400, cache read 560000, cache write 78000' });
  assert.deepEqual(afkRunUsage(JSON.stringify({ type: 'result', result: 'ok' })), { result: 'ok', line: 'Usage: tokens in 0, out 0, cache read 0, cache write 0' });
  assert.equal(afkRunUsage('Summary: plain text'), null);
  assert.equal(afkRunUsage('{"other":1}'), null);
  assert.equal(afkRunUsage(undefined), null);
});

test('issue writes reach only the configured repository or the workflow tooling repository', () => {
  const cfg = { repo: 'acme/app', toolingRepository: 'https://github.com/acme/skills.git' };
  assert.equal(issueTargetRepo(cfg, undefined), 'acme/app');
  assert.equal(issueTargetRepo(cfg, 'acme/app'), 'acme/app');
  assert.equal(issueTargetRepo(cfg, 'acme/skills'), 'acme/skills');
  assert.throws(() => issueTargetRepo(cfg, 'other/repo'), /only acme\/app or the workflow tooling repository acme\/skills/);
});

test('a unique issue title resolves to the oldest open exact match', () => {
  const issues = [{ number: 9, title: 'Owner improvements' }, { number: 4, title: 'Owner improvements' }, { number: 2, title: 'Owner improvements (old)' }];
  assert.equal(oldestExactTitle(issues, 'Owner improvements'), 4);
  assert.equal(oldestExactTitle(issues, 'Missing'), null);
});

test('issue writes never carry private repository evidence into a public one', () => {
  assert.throws(() => assertIssueVisibility({ name: 'acme/app', private: true }, { name: 'acme/skills', private: false }), /acme\/skills is public and acme\/app is private; file in acme\/app/);
  assert.doesNotThrow(() => assertIssueVisibility({ name: 'acme/app', private: false }, { name: 'acme/skills', private: false }));
  assert.doesNotThrow(() => assertIssueVisibility({ name: 'acme/app', private: true }, { name: 'acme/skills', private: true }));
});
