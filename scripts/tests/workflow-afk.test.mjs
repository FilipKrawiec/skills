import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  afkCandidates,
  afkColumn,
  afkDependenciesFromIssueBody,
  afkFree,
  afkIssueState,
  afkLiveHolds,
  afkMergeThenPlan,
  afkPathsFromIssueBody,
  afkPathsWithinScope,
  afkPlan,
  afkPrFiles,
  afkPrRecord,
  afkPrState,
  afkPriority,
  afkSpentEntries,
  afkSpentState,
  afkStartRefusal,
  afkReviewKind,
  afkReviewerApproved,
  prLinkedIssues,
  afkAttendedSessions,
} from '../../plugins/common/workflow/scripts/lib/afk-board.mjs';
import {
  afkAgentEnvironment,
  afkCheckRetroMode,
  afkCheckRunLimits,
  afkReleaseAttended,
  afkReleaseReviewClaims,
  afkDefaultStartCommand,
  afkEndCards,
  afkEndStatus,
  afkLive,
  afkOpenPrNote,
  afkLoadEnvironment,
  afkOneShotLive,
  afkOtherHolds,
  afkRunUsage,
  afkShow,
  afkStatus,
  afkStartCount,
  afkStartIdleLines,
  hasProcessAncestor,
} from '../../plugins/common/workflow/scripts/lib/afk-runs.mjs';
import {
  afkDuration,
  afkEnsureTooling,
  afkExcludeWorktrees,
  afkForeignHeads,
  afkLaunchAgent,
  afkLauncherSource,
  afkOwnsHead,
  afkPlistBelongsToWorkflow,
  afkPluginDir,
  afkReap,
  afkReleaseRunTree,
  afkRunAlive,
  afkRunStarted,
  afkStopSupervisedAgent,
  afkSweepRunTrees,
  afkWorkflowCliPath,
} from '../../plugins/common/workflow/scripts/lib/afk-watch.mjs';
import {
  applyGithubMetadata,
  assertDistinctPushRoles,
  githubPushRemoteMatches,
  githubRepoFromRemote,
  githubScopeFailure,
  missingProjectScope,
  readThroughLocalCache,
  discoveredProject,
  workflowDefaults,
  workflowLabels,
  workflowMetadataCachePath,
} from '../../plugins/common/workflow/scripts/lib/core.mjs';
import {
  hasLockfAncestor,
  needsAbsoluteInvocation,
  oneShotRunId,
} from '../../plugins/common/workflow/scripts/workflow.mjs';
import {
  afkRetroRefusal,
  assertIssueVisibility,
  issueTargetRepo,
  oldestExactTitle,
  scopeOverlaps,
  validateIssueCommentBody,
  workspaceFilePath,
} from '../../plugins/common/workflow/scripts/lib/issues.mjs';

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

const epic = { number: 1, labels: ['type:epic'], ancestors: [], priority: 'P1', status: 'In progress', subIssuesSummary: { total: 2, completed: 0 } };
function issue(number, labels, extra = {}) {
  return { number, labels, ancestors: [1], blocked: false, paths: [`src/${number}.js`], priority: 2, ...extra };
}

test('AFK plan offers no review of a PR whose linked issue a live run holds', () => {
  const pr = (number, linked) => ({ number, title: `PR ${number}`, body: `Closes #${linked}`, closingIssuesReferences: [{ number: linked, repository: { name: 'app', owner: { login: 'acme' } } }], headRefOid: 'abc', labels: [], reviews: [], statusCheckRollup: [], mergeable: 'MERGEABLE' });
  const loose = { ...issue(5, ['lane:afk']), ancestors: [] };
  const comments = new Map([[5, [{ body: '<!-- afk-issue-hold session=live-run -->' }]]]);
  const plan = afkPlan(cfg, ['live-run'], number => comments.get(number) || [], 'new-run', { issues: [epic, loose, issue(6, ['lane:afk'])], prs: [pr(10, 5), pr(11, 6)] });
  assert.deepEqual(plan.units.map(unit => unit.text), ['PR #11 (PR 11) awaits its review']);
});

test('afk check names the next unit, holding back an issue whose packet depends on an open PR until it merges', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'afk-check-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin'), home = join(root, 'home'), repo = join(root, 'repo');
  mkdirSync(bin); mkdirSync(join(home, '.config', 'gh-agents'), { recursive: true }); mkdirSync(join(repo, '.agents'), { recursive: true });
  writeFileSync(join(home, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'token' } }));
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(join(bin, 'git'), `#!/usr/bin/env node\nif(process.argv[2]==='fetch') process.exit(0);\nprocess.exit(require('node:child_process').spawnSync(process.env.REAL_GIT, process.argv.slice(2), { stdio: 'inherit' }).status ?? 1);\n`);
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nif(a[0]==='auth') { console.log('token'); process.exit(0); }\nif(a[0]==='pr') { out(process.env.TEST_PR ? [{number:285,title:'ledger',body:'',headRefOid:'abc',labels:[{name:'review:owner'}],reviews:[{author:{login:'reviewer'},state:'COMMENTED',commit:{oid:'abc'},body:''}],isDraft:false,statusCheckRollup:[],mergeable:'MERGEABLE',files:[{path:'docs/a.md',changeType:'MODIFIED'}]}] : []); process.exit(0); }\nif(a[0]==='issue') { out([]); process.exit(0); }\nif(a.some(x=>x.includes('pullRequests(states'))) { out({data:{repository:{pullRequests:{nodes:[]}}}}); process.exit(0); }\nif(a.includes('rate_limit')) { console.log('5000 2000000000'); process.exit(0); }\nif(a.includes('graphql')) { const row=(number,labels,parent,body='')=>({number,title:'item',body,lastEditedAt:'2020-01-01T00:00:00Z',labels:{nodes:labels.map(name=>({name}))},blockedBy:{nodes:[]},milestone:null,parent,projectItems:{nodes:[]}}); out({data:{repository:{issues:{pageInfo:{hasNextPage:false},nodes:[row(1,['type:epic'],null),row(1082,['lane:afk'],{number:1,parent:null},'\\u0060\\u0060\\u0060scope\\n{\\"paths\\":[\\"docs/\\"],\\"dependencies\\":[\\"#285\\"]}\\n\\u0060\\u0060\\u0060'),row(1083,['lane:afk'],{number:1,parent:null},'Scope: prose only')]}}}}); process.exit(0); }\nif(a.some(x=>x.includes('/comments')) && a.includes('--slurp')) { out([[]]); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('event');\n`);
  chmodSync(join(bin, 'git'), 0o755); chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(join(repo, '.agents', 'config.json'), JSON.stringify({ version: 1, identities: { implementer: 'builder', reviewer: 'reviewer' }, steps: { process: null, assemble: null, test: ['true'] } }));
  mkdirSync(join(repo, '.github')); writeFileSync(join(repo, '.github', 'CODEOWNERS'), '* @reviewer\n/*.rules @owner\n');
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('WORKFLOW_') && !key.startsWith('GIT_'))), PATH: `${bin}:${process.env.PATH}`, HOME: home, REAL_GIT: realGit, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = (...args) => assert.equal(spawnSync(realGit, args, { cwd: repo, env }).status, 0, args.join(' '));
  git('init', '-q', '-b', 'main'); git('remote', 'add', 'origin', 'https://github.com/acme/app.git'); git('add', '.agents/config.json', '.github/CODEOWNERS');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'initial'); git('update-ref', 'refs/remotes/origin/main', 'HEAD'); git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  // A recent explore pass keeps the idle explorer from taking the slot.
  writeFileSync(join(repo, '.git', 'afk-idle-explore.json'), JSON.stringify({ started: Date.now() }));
  const check = pr => spawnSync(process.execPath, [fileURLToPath(new URL('../../plugins/common/workflow/scripts/workflow.mjs', import.meta.url)), 'afk', 'check'], { cwd: repo, encoding: 'utf8', env: { ...env, TEST_PR: pr ? '1' : '' } });
  const open = check(true);
  assert.equal(open.status, 0, `${open.stdout}\n${open.stderr}`);
  assert.match(open.stdout, /^Start: 1\nNext: Todo: #1083 is in Todo without a valid scope packet: invoke `refine` on it alone to add one\n/);
  const merged = check(false);
  assert.equal(merged.status, 0, `${merged.stdout}\n${merged.stderr}`);
  assert.match(merged.stdout, /^Start: 1\nNext: Todo: #1082 is ready\n/);
});

test('one-shot AFK runs are counted from live watcher PIDs', t => {
  const outside = mkdtempSync(join(tmpdir(), 'afk-live-'));
  const previous = process.cwd();
  t.after(() => { process.chdir(previous); rmSync(outside, { recursive: true, force: true }); });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  assert.equal(spawnSync('git', ['init', '--quiet', outside], { env }).status, 0);
  process.chdir(outside);
  assert.deepEqual(afkLive({}), []);
  writeFileSync(join(outside, '.git', 'afk-holds.json'), JSON.stringify({ mine: [{ issue: 1, oneShot: true, watcherPid: process.pid }] }));
  assert.deepEqual(afkLive({}), ['mine']);
  const ledger = {
    live: [{ oneShot: true, watcherPid: 12 }],
    dead: [{ oneShot: true, watcherPid: 13 }],
    background: [{ oneShot: false, watcherPid: 12 }],
  };
  assert.deepEqual(afkOneShotLive(ledger, pid => pid === 12), ['live']);
});

test('workflow label catalog is centralized in the CLI', () => {
  assert.deepEqual(Object.keys(workflowLabels), [
    'lane:afk', 'lane:proposed', 'lane:owner', 'state:claimed', 'state:started', 'state:reviewing',
    'review:owner', 'risk:R0', 'risk:R1', 'risk:R2', 'nits:swept', 'type:epic', 'type:story', 'type:bug', 'type:chore', 'type:task',
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

test('board discovery tells no board, one board and tied boards apart', () => {
  assert.equal(discoveredProject([]), false);
  assert.deepEqual(discoveredProject([{ number: 5, title: 'Pro', owner: 'acme', count: 3 }, { number: 6, title: 'Old', count: 1 }]), { number: 5, title: 'Pro', owner: 'acme' });
  assert.deepEqual(discoveredProject([{ number: 5, title: 'Pro', count: 2 }, { number: 6, title: 'Old', count: 2 }, { number: 7, title: 'X', count: 1 }]), { ambiguous: [5, 6] });
});

test('silent board status callers return false quietly for every unusable board state', t => {
  const logged = [];
  t.mock.method(console, 'log', (...args) => logged.push(args));
  t.mock.method(console, 'error', (...args) => logged.push(args));
  for (const project of [false, { ambiguous: [5, 6] }, null, undefined]) {
    assert.equal(afkStatus({ repo: 'acme/app', project }, 4, 'TODO', true), false);
    assert.equal(afkStatus({ repo: 'acme/app', project }, 4, 'NOPE', true), false);
  }
  assert.deepEqual(logged, []);
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
  const output = afkShow({ number: 2, column: 'Todo', paths: ['docs/a.md'], comment: 3 }, [{ issue: 2, text: '#2 is ready' }], [], true);
  assert.match(output, /^Hold: issue #2 in Todo \(comment 3\)/);
  assert.match(output, /Work: #2 is ready/);
});

test('a PR links an issue only by a closing reference in its repository or a Part of line', () => {
  const closes = (number, owner = 'acme') => ({ number, repository: { name: 'app', owner: { login: owner } } });
  const pr = (body, refs = []) => ({ number: 7, title: 'Fix', body, closingIssuesReferences: refs, headRefOid: 'head', labels: [], statusCheckRollup: [], reviews: [] });
  assert.deepEqual(afkPrRecord(pr('Refs #8\nSee #9, and part of #10'), cfg).issues, [], 'a mention links nothing');
  assert.deepEqual(afkPrRecord(pr('Closes #8', [closes(8), closes(11, 'other')]), cfg).issues, [8], 'only a closing link in this repository counts');
  assert.deepEqual(prLinkedIssues(pr('Summary\n  Part of #12\nPart of #13.'), 'Acme/App'), [12, 13]);
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

test('the approval check and the spent ledger classify the same reviews as verdicts and thread replies', () => {
  const workflowCfg = { ...cfg, implementer: 'builder' };
  const approval = { author: { login: 'reviewer' }, state: 'APPROVED', commit: { oid: 'head' }, body: '<!-- agent-review sha=head verdict=ready -->' };
  const replies = [
    { author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'head' }, body: 'Agreed, as agent-review asked.' },
    { author: { login: 'builder' }, state: 'COMMENTED', commit: { oid: 'head' }, body: 'Fixed in head.' },
  ];
  const outside = { author: { login: 'owner' }, state: 'COMMENTED', commit: { oid: 'head' }, body: '' };
  assert.deepEqual([approval, ...replies, outside].map(review => afkReviewKind(review, workflowCfg)), ['verdict', 'reply', 'reply', 'other']);
  const pr = reviews => afkPrRecord({ number: 7, title: 'Update', body: 'Issue #8', headRefOid: 'head', labels: [], statusCheckRollup: [], mergeable: 'MERGEABLE', reviews }, workflowCfg);
  const state = reviews => afkPrState(pr(reviews), [], workflowCfg, 'base1');
  assert.equal(pr([approval, ...replies]).approved, true, 'thread replies keep the approval');
  assert.equal(state([approval, ...replies]), state([approval]), 'thread replies leave the spent state');
  assert.notEqual(state([approval, outside]), state([approval]), 'an outside review changes the spent state');
  const unmarkedFixes = { author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', commit: { oid: 'head' }, body: '' };
  assert.equal(afkReviewKind(unmarkedFixes, workflowCfg), 'other');
  assert.equal(pr([approval, unmarkedFixes]).approved, false, 'an unmarked Reviewer change request still blocks');
  assert.notEqual(state([approval, unmarkedFixes]), state([approval]), 'and changes the spent state');
});

test('run limits must be positive integers', () => {
  assert.doesNotThrow(() => afkCheckRunLimits({ maxRuns: 4 }));
  assert.throws(() => afkCheckRunLimits({ maxRuns: 0 }), /afk\.maxRuns must be a positive integer/);
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

test('a PR `ship` marked ready is served for its approval though its head, reviews and checks did not change', () => {
  const workflowCfg = { ...cfg, implementer: 'builder' };
  const authorReady = { author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: '<!-- agent-review sha=abc round=1 mode=author verdict=ready -->' };
  const pr = extra => afkPrRecord({ number: 9, title: 'Fix', body: 'No linked issue.', headRefOid: 'abc', isDraft: true, labels: [{ name: 'risk:R1' }], reviews: [authorReady], statusCheckRollup: [{ conclusion: 'SUCCESS' }], mergeable: 'MERGEABLE', files: [{ path: 'src/a.js' }], ...extra }, workflowCfg);
  const spent = { 9: afkPrState(pr(), [], workflowCfg, 'base1') };
  const units = afkPlan(workflowCfg, [], () => [], 'new-run', { issues: [epic], prs: [pr({ isDraft: false })], spent, base: 'base1' }).units;
  assert.deepEqual(units.map(unit => unit.text), ['PR #9 (Fix) awaits its review'], 'the ship run spent the draft; the ready PR needs the Reviewer approval');
});

test('a PR a finished run left unchanged gets no new run until its head, reviews, checks, merge state, base or an outside comment change', () => {
  const pr = extra => ({ number: 9, title: 'Fix', body: 'No linked issue.', headRefOid: 'abc', labels: [], reviews: [{ author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', commit: { oid: 'abc' }, body: '' }], statusCheckRollup: [], mergeable: 'MERGEABLE', files: [{ path: 'src/a.js' }], ...extra });
  const workflowCfg = { ...cfg, implementer: 'builder' };
  const plan = (record, comments = [], spentComments = [], base = 'base1') => {
    const spent = { 9: afkPrState(afkPrRecord(pr(), workflowCfg), spentComments, workflowCfg, 'base1') };
    return afkPlan(workflowCfg, [], number => number === 9 ? comments : [], 'new-run', { issues: [epic], prs: [record], spent, base });
  };
  const unchanged = plan(pr());
  assert.deepEqual(unchanged.units, []);
  assert.deepEqual(unchanged.unchanged, [9]);
  const runNotes = [{ id: 5, user: { login: 'builder' }, body: 'Round-2 notes' }, { id: 6, user: { login: 'builder' }, body: '<!-- afk-issue-released session=afk-1 -->' }];
  assert.deepEqual(plan(pr(), runNotes).units, [], 'the workflow\'s own comments are not new input');
  const offered = record => plan(record).units.map(unit => unit.issue);
  assert.deepEqual(offered(pr({ headRefOid: 'def' })), [9], 'a new head is reviewed');
  assert.deepEqual(offered(pr({ reviews: [...pr().reviews, { author: { login: 'owner' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: '' }] })), [9], 'a new review');
  assert.deepEqual(offered(pr({ statusCheckRollup: [{ conclusion: 'FAILURE' }] })), [9], 'a red check');
  assert.deepEqual(plan(pr(), [], [], 'base2').units.map(unit => unit.issue), [9], 'a run that waited on a red base is served once the base moves');
  const states = ['MERGEABLE', 'CONFLICTING', 'UNKNOWN'].map(mergeable => afkPrState(afkPrRecord(pr({ mergeable }), workflowCfg), [], workflowCfg, 'base1'));
  assert.equal(new Set(states).size, 3, 'a conflict and an unknown merge state differ from mergeable');
  assert.notEqual(afkPrState(afkPrRecord(pr({ mergeable: 'CONFLICTING' }), workflowCfg), [], workflowCfg), afkPrState(afkPrRecord(pr({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }), workflowCfg), [], workflowCfg), 'a conflict differs from a failed check');
  const replies = [{ author: { login: 'builder' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: 'Fixed in abc.' }, { author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: 'Agreed.' }];
  assert.deepEqual(offered(pr({ reviews: [...pr().reviews, ...replies] })), [], 'the workflow identities\' thread replies are not new reviews');
  assert.deepEqual(offered(pr({ reviews: [...pr().reviews, { author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: '<!-- agent-review sha=abc round=2 verdict=fixes -->' }] })), [9], 'a marked Reviewer verdict is');
  assert.deepEqual(plan(pr(), [{ id: 7, user: { login: 'owner' }, body: 'Please also cover X' }]).units.map(unit => unit.issue), [9], 'an owner comment');
  const fresh = afkPlan(workflowCfg, [], () => [], 'new-run', { issues: [epic], prs: [pr()], base: 'base1' }).units[0];
  assert.deepEqual([fresh.pr, fresh.state], [9, 'abc:ready:1/0:green:mergeable:base1::'], 'the unit carries the state its run will spend');
});

test('a red PR unit takes its scope from its packet, else its changed files', () => {
  const red = (body, extra = {}) => ({ number: 9, title: 'Fix', body, headRefOid: 'abc', labels: [], isDraft: false, mergeable: 'CONFLICTING', reviews: [{ author: { login: cfg.reviewer }, commit: { oid: 'abc' }, state: 'COMMENTED' }], files: [{ path: 'src/a.js' }, { path: 'docs/b.md' }], ...extra });
  const paths = (pr, issues = [epic]) => afkPlan(cfg, [], () => [], 'new-run', { issues, prs: [pr] }).units[0].paths;
  assert.deepEqual(paths(red('No linked issue.')), ['src/a.js', 'docs/b.md']);
  assert.deepEqual(paths(red('```scope\n{"paths":["src/"]}\n```')), ['src/'], 'the PR body packet wins');
  assert.deepEqual(paths(red('Part of #2'), [epic, issue(2, ['lane:afk'])]), ['src/2.js'], 'the linked issue packet wins');
  assert.deepEqual(paths(red('Part of #2\n```scope\n{"paths":["src/"]}\n```'), [epic, issue(2, ['lane:afk'])]), ['src/2.js'], 'a PR packet cannot widen its issue packet');
  assert.deepEqual(paths(red('Part of #2'), [epic, issue(2, ['lane:afk'], { paths: [] })]), [], 'a linked empty scope stays empty');
  assert.deepEqual(paths(red('Part of #2', { files: [{ path: 'src/new.js', previousPath: 'src/old.js' }] }), [epic, issue(2, ['lane:afk'], { paths: null })]), ['src/new.js', 'src/old.js'], 'a rename keeps its source');
  const byFiles = (pr, issues = [epic]) => afkPlan(cfg, [], () => [], 'new-run', { issues, prs: [pr] }).units[0].scopedByFiles;
  assert.equal(byFiles(red('No linked issue.')), true, 'only a unit scoped by its files follows base renames');
  assert.equal(byFiles(red('```scope\n{"paths":["src/"]}\n```')), undefined);
  assert.equal(byFiles(red('Part of #2'), [epic, issue(2, ['lane:afk'])]), undefined);
});

test('a PR with a rename or 100 files re-reads every page of its files over REST', () => {
  const pages = [[{ filename: 'src/new.js', previous_filename: 'src/old.js' }], [{ filename: 'docs/b.md' }]];
  const read = [];
  const files = pr => afkPrFiles(pr, number => { read.push(number); return pages; }).files;
  assert.deepEqual(files({ number: 9, files: [{ path: 'src/new.js', changeType: 'RENAMED' }] }), [{ path: 'src/new.js', previousPath: 'src/old.js' }, { path: 'docs/b.md', previousPath: undefined }]);
  assert.equal(files({ number: 10, files: Array.from({ length: 100 }, (_, n) => ({ path: `f${n}`, changeType: 'MODIFIED' })) }).length, 2);
  assert.equal(files({ number: 11, files: Array.from({ length: 99 }, (_, n) => ({ path: `f${n}`, changeType: 'MODIFIED' })) }).length, 99);
  assert.deepEqual(read, [9, 10]);
  assert.equal(files({ number: 12, files: [{ path: 'src/new.js' }] }).length, 2, 'files without changeType are re-read');
  assert.deepEqual(read, [9, 10, 12]);
});

test('a PR whose files cannot be read leaves only its own fix unit out of the plan', () => {
  const failing = number => { if (number === 9) throw new Error('HTTP 502'); return [[{ filename: 'src/b.js' }]]; };
  const readOf = pr => afkPrFiles(pr, failing);
  const unread = readOf({ number: 9, files: [{ path: 'src/new.js', changeType: 'RENAMED' }] });
  assert.equal(unread.filesUnread, true);
  const pr = (number, extra) => ({ number, title: `PR ${number}`, body: 'No linked issue.', headRefOid: 'abc', labels: [], reviews: [{ author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: '' }], statusCheckRollup: [{ conclusion: 'FAILURE' }], mergeable: 'MERGEABLE', ...extra });
  const units = prs => afkPlan(cfg, [], () => [], 'new-run', { issues: [epic], prs }).units;
  const fixes = units([pr(9, unread), pr(10, readOf({ number: 10, files: [{ path: 'src/b.js' }] }))]);
  assert.deepEqual(fixes.map(unit => [unit.issue, unit.paths]), [[10, ['src/b.js']]]);
  assert.deepEqual(units([pr(9, { ...unread, body: '```scope\n{"paths":["src/"]}\n```' })]).map(unit => unit.paths), [['src/']], 'a PR packet still scopes it');
  const awaiting = units([pr(9, { ...unread, reviews: [], statusCheckRollup: [] })]);
  assert.deepEqual(awaiting.map(unit => [unit.issue, unit.review]), [[9, true]], 'its review still runs');
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
  assert.deepEqual(afkRunUsage(output), { result: 'Summary: done', line: 'Usage: $1.23, 42 turns, 13 min, tokens in 1200, out 3400, cache read 560000, cache write 78000', ok: true });
  assert.deepEqual(afkRunUsage(JSON.stringify({ type: 'result', result: 'ok' })), { result: 'ok', line: 'Usage: tokens in 0, out 0, cache read 0, cache write 0', ok: true });
  assert.equal(afkRunUsage(JSON.stringify({ type: 'result', is_error: true, result: 'API error' })).ok, false, 'an error result spends no PR state');
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

test('scope overlaps match equal paths and directories, skipping issues without a packet', () => {
  const packet = paths => `\u0060\u0060\u0060scope\n${JSON.stringify({ paths })}\n\u0060\u0060\u0060`;
  const issues = [
    { number: 1, title: 'same file', body: packet(['plugins/a/workflow.mjs']) },
    { number: 2, title: 'parent dir', body: packet(['scripts/tests/']) },
    { number: 3, title: 'no packet', body: 'Edits scripts/tests/x.mjs' },
    { number: 4, title: 'sibling', body: packet(['scripts/testsuite.mjs', 'docs']) },
  ];
  assert.deepEqual(scopeOverlaps(issues, ['plugins/a/workflow.mjs', 'scripts/tests/x.test.mjs', 'docs/a.md']).map(issue => issue.number), [1, 2, 4]);
  assert.deepEqual(scopeOverlaps(issues, ['plugins/a/']).map(issue => issue.number), [1]);
  assert.deepEqual(scopeOverlaps(issues, ['scripts/']).map(issue => issue.number), [2, 4]);
  assert.deepEqual(scopeOverlaps(issues, null), []);
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

test('a foreign push on a held PR releases its run, and the PR is served again at the new head', t => {
  const root = mkdtempSync(join(tmpdir(), 'afk-foreign-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd, env, encoding: 'utf8' });
  const repo = join(root, 'repo'), tree = join(root, 'run');
  assert.equal(git(root, 'init', '-q', '-b', 'main', repo).status, 0);
  assert.equal(git(repo, 'commit', '-q', '--allow-empty', '-m', 'base').status, 0);
  assert.equal(git(repo, 'worktree', 'add', '-q', '-b', 'run', tree).status, 0);
  const head = cwd => git(cwd, 'rev-parse', 'HEAD').stdout.trim();
  const taken = head(repo);
  const pr = sha => ({ number: 9, title: 'Fix', body: '', closingIssuesReferences: [], headRefOid: sha, labels: [], reviews: [], statusCheckRollup: [], mergeable: 'MERGEABLE' });
  const plan = sha => afkPlan(cfg, [], () => [], 'new-run', { issues: [epic], prs: [pr(sha)] });
  const [unit] = plan(taken).units;
  assert.deepEqual({ issue: unit.issue, review: unit.review, pr: unit.pr, head: unit.head }, { issue: 9, review: true, pr: 9, head: taken }, 'the hold records the head it was taken at');

  const ledger = { 'run-1': [{ number: 9, epic: 1, paths: [], review: true, pr: 9, head: taken, comment: 5 }] };
  const owns = (id, sha) => afkOwnsHead(tree, sha);
  assert.deepEqual(afkForeignHeads(ledger, ['run-1'], () => taken, owns), [], 'an unchanged head keeps the run');
  assert.equal(git(tree, 'commit', '-q', '--allow-empty', '-m', 'own fix').status, 0);
  assert.deepEqual(afkForeignHeads(ledger, ['run-1'], () => head(tree), owns), [], 'a head the run pushed keeps the run');
  const pushed = head(tree);
  assert.equal(git(tree, 'commit', '-q', '--amend', '--allow-empty', '-m', 'own fix, amended').status, 0);
  assert.deepEqual(afkForeignHeads(ledger, ['run-1'], () => pushed, owns), [], 'a head the run pushed and then rewrote keeps the run');
  assert.equal(git(repo, 'commit', '-q', '--allow-empty', '-m', 'foreign fix').status, 0);
  const foreign = head(repo);
  assert.deepEqual(afkForeignHeads(ledger, ['run-1'], () => foreign, owns), [{ id: 'run-1', pr: 9, from: taken, to: foreign }]);
  assert.deepEqual(afkForeignHeads(ledger, [], () => foreign, owns), [], 'an ended run is left to its own release');
  assert.equal(afkOwnsHead(tree, '0'.repeat(40)), false, 'a head this checkout never fetched is foreign');

  delete ledger['run-1'];
  const [again] = [...afkCandidates(plan(foreign).units, afkOtherHolds(ledger, [], 'new-run'))];
  assert.deepEqual({ number: again.number, head: again.unit.head }, { number: 9, head: foreign }, 'the released PR is served at its new head');
});

test('a stop under a minute is reported in seconds, never as 0 minutes', () => {
  assert.equal(afkDuration(300), '1 second');
  assert.equal(afkDuration(59_000), '59 seconds');
  assert.equal(afkDuration(60_000), '1 minute');
  assert.equal(afkDuration(30 * 60_000), '30 minutes');
});

test('a run past afk.maxRunMinutes is stopped so its hold is released', () => {
  assert.equal(workflowDefaults.afk.maxRunMinutes, 60);
  const started = Date.now();
  assert.throws(() => afkLaunchAgent({ argv: [process.execPath, '-e', 'setTimeout(() => {}, 20000)'], replacements: {}, cwd: process.cwd(), timeoutMs: 300 }), /stopped after/);
  assert.ok(Date.now() - started < 10000, 'the agent did not run to its end');
  assert.equal(afkLaunchAgent({ argv: [process.execPath, '-e', 'console.log("done")'], replacements: {}, cwd: process.cwd(), timeoutMs: 10000 }), 'done');
});

test('a run past afk.maxRunMinutes is stopped with its whole process group, killing what ignores SIGTERM', () => {
  const dir = mkdtempSync(join(tmpdir(), 'afk-group-'));
  const pidFile = join(dir, 'grandchild');
  const agent = `const { spawn } = require('node:child_process'); const c = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' }); require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(() => {}, 1000);`;
  try {
    assert.throws(() => afkLaunchAgent({ argv: [process.execPath, '-e', agent], replacements: {}, cwd: dir, timeoutMs: 1000, graceMs: 300 }), error => error.code === 'ETIMEDOUT' && /stopped after/.test(error.message));
    const grandchild = Number(readFileSync(pidFile, 'utf8'));
    const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 50 && alive(grandchild); i++) spawnSync('sleep', ['0.1']);
    assert.equal(alive(grandchild), false, 'the agent\'s grandchild is gone');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a foreign-head run is stopped with its agent\'s whole process group, killing what ignores SIGTERM', () => {
  const dir = mkdtempSync(join(tmpdir(), 'afk-foreign-group-'));
  const pidFile = join(dir, 'grandchild');
  const agent = `const { spawn } = require('node:child_process'); const c = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' }); require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(() => {}, 1000);`;
  // The supervisor launches its agent as afkLaunchAgent does: synchronously, in the agent's own process group.
  const supervisor = spawn(process.execPath, ['-e', `require('node:child_process').spawnSync(process.execPath, ['-e', ${JSON.stringify(agent)}], { stdio: 'ignore', detached: true })`], { stdio: 'ignore' });
  const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const written = () => { try { return Number(readFileSync(pidFile, 'utf8')) || 0; } catch { return 0; } };
  let grandchild = 0;
  try {
    for (let i = 0; i < 100 && !(grandchild = written()); i++) spawnSync('sleep', ['0.1']);
    assert.ok(grandchild > 0, 'the agent started its grandchild');
    afkStopSupervisedAgent(supervisor.pid, 300);
    for (let i = 0; i < 50 && alive(grandchild); i++) spawnSync('sleep', ['0.1']);
    assert.equal(alive(grandchild), false, 'the agent\'s grandchild is gone');
  } finally {
    afkStopSupervisedAgent(supervisor.pid, 0);
    if (grandchild > 0) try { process.kill(grandchild, 'SIGKILL'); } catch {}
    supervisor.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true });
  }
});

test('with runsCommand, reap stops a watcher-launched run past afk.maxRunMinutes through stopCommand', () => {
  const dir = mkdtempSync(join(tmpdir(), 'afk-reap-'));
  const stops = join(dir, 'stops');
  const stamp = minutesAgo => new Date(Date.now() - minutesAgo * 60_000).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const agents = [
    { kind: 'background', name: `afk-${stamp(31)}-1-1`, id: 'old', state: 'working' },
    { kind: 'background', name: `afk-${stamp(5)}-1-1`, id: 'young', state: 'working' },
    { kind: 'background', name: `afk-${stamp(40)}-1-1`, id: 'gone', state: 'stopped' },
    { kind: 'background', name: 'afk-owner', id: 'unstamped', state: 'working' },
  ];
  const cfg = { ...workflowDefaults.afk, runPrefix: 'afk-', maxRunMinutes: 30, waitTimeoutMinutes: 60, stateFile: join(dir, '{id}.json'),
    runsCommand: [process.execPath, '-e', `console.log(${JSON.stringify(JSON.stringify(agents))})`],
    stopCommand: [process.execPath, '-e', `require('fs').appendFileSync(${JSON.stringify(stops)}, process.argv[1] + '\\n')`, '{id}'] };
  try {
    afkReap(cfg, dir);
    assert.equal(readFileSync(stops, 'utf8'), 'old\n');
    assert.equal(afkRunStarted('20260101093000-42-1'), Date.UTC(2026, 0, 1, 9, 30, 0));
    assert.equal(afkRunStarted('owner'), null, 'a run the watcher did not name is not timed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const board = (number, status, labels = ['lane:afk'], extra = {}) => issue(number, labels, { status, ...extra });
const reviewPr = (number, extra = {}) => ({ number, title: `PR ${number}`, body: 'No linked issue.', headRefOid: 'abc', labels: [], reviews: [], statusCheckRollup: [], mergeable: 'MERGEABLE', files: [{ path: 'src/a.js' }], ...extra });

test('every ping serves Blocked, then Review, then Todo, then Backlog, by Priority and then the oldest number', () => {
  const issues = [epic, board(9, 'Backlog', ['lane:proposed']), board(8, 'Todo', ['lane:afk'], { priority: 'P2' }), board(7, 'Todo', ['lane:afk'], { priority: 'P0' }), board(6, 'Blocked'), board(5, 'Done'), board(4, 'Todo', ['lane:owner'])];
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues, prs: [reviewPr(20)] });
  assert.deepEqual(plan.units.map(unit => [unit.column, unit.pr ?? unit.issue]), [['Blocked', 6], ['Review', 20], ['Todo', 7], ['Todo', 8], ['Backlog', 9]]);
  assert.deepEqual(plan.units.map(unit => Boolean(unit.refine)), [true, false, false, false, true], 'Blocked and Backlog get refine runs that change no files');
  assert.match(plan.units[0].text, /#6 is Blocked: invoke `refine` on it alone to clear its blocker and move it to Todo/);
  const named = reviewPr(21, { body: 'Closes #6', closingIssuesReferences: [{ number: 6, repository: { name: 'app', owner: { login: 'acme' } } }] });
  const open = afkPlan(cfg, [], () => [], 'new-run', { issues, prs: [named] });
  assert.deepEqual(open.units.filter(unit => unit.column !== 'Todo' && unit.column !== 'Backlog').map(unit => [unit.column, unit.pr ?? unit.issue, Boolean(unit.refine)]), [['Review', 21, false]], 'a Blocked card its open PR names gets no refine run; the PR unit serves it');
  assert.match(plan.units[4].text, /#9 is in Backlog: invoke `refine` on it alone, with `review` eligibility/);
  assert.deepEqual([...afkCandidates(plan.units, [{ number: 6 }, { number: 20, pr: 20 }])].map(item => item.number), [7, 8, 9], 'held units are skipped');
});

test('at most afk.maxRuns runs are live, and each ping starts at most one', () => {
  assert.equal(afkFree({ maxRuns: 4 }, ['a', 'b', 'c']), 1);
  assert.equal(afkFree({ maxRuns: 4 }, ['a', 'b', 'c', 'd']), 0);
  assert.equal(afkFree({ maxRuns: 4 }, ['a', 'b', 'c', 'me'], 'me'), 1, 'the starting run does not count against itself');
  assert.equal(afkStartCount({ maxRuns: 4 }, [], [{}, {}, {}]), 1);
  assert.equal(afkStartCount({ maxRuns: 4 }, ['a', 'b', 'c', 'd'], [{}]), 0);
  assert.equal(afkStartCount({ maxRuns: 4 }, [], []), 0);
});

test('a live hold keeps an issue or a PR out of the plan', () => {
  const comments = new Map([[3, [{ id: 1, body: '<!-- afk-issue-hold session=live-run -->' }]], [4, [{ id: 2, body: '<!-- afk-issue-hold session=gone-run -->' }]]]);
  const plan = afkPlan(cfg, ['live-run'], number => comments.get(number) || [], 'new-run', { issues: [epic, board(2, 'Todo'), board(3, 'Todo'), board(4, 'Todo')], prs: [] });
  assert.deepEqual(plan.units.map(unit => unit.issue), [2, 4]);
});

test('a Todo issue waits for its open blockers and an open PR its packet depends on', () => {
  assert.deepEqual(afkDependenciesFromIssueBody('```scope\n{"paths":["src/"],"dependencies":["#285", 12, "x"]}\n```'), [285, 12]);
  assert.deepEqual(afkDependenciesFromIssueBody('no packet'), []);
  const open = reviewPr(285, { reviews: [{ author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: '' }], labels: [{ name: 'review:owner' }] });
  const units = (issues, prs = []) => afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, ...issues], prs }).units.map(unit => unit.issue);
  assert.deepEqual(units([board(6, 'Todo', ['lane:afk'], { dependencies: [285] })], [open]), []);
  assert.deepEqual(units([board(6, 'Todo', ['lane:afk'], { dependencies: [285] })]), [6]);
  assert.deepEqual(units([board(6, 'Todo', ['lane:afk'], { blocked: true })]), []);
});

test('a blocked or dependent Todo issue without a scope packet still gets its refine run', () => {
  const open = reviewPr(285, { reviews: [{ author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: '' }], labels: [{ name: 'review:owner' }] });
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, board(6, 'Todo', ['lane:afk'], { paths: null, blocked: true }), board(7, 'Todo', ['lane:afk'], { paths: null, dependencies: [285] })], prs: [open] });
  assert.deepEqual(plan.units.filter(unit => !unit.pr).map(unit => [unit.issue, unit.column, Boolean(unit.refine), unit.paths]), [[6, 'Todo', true, []], [7, 'Todo', true, []]]);
  assert.match(plan.units.find(unit => unit.issue === 6).text, /#6 is in Todo without a valid scope packet: invoke `refine`/);
  const blockedEpic = { number: 30, labels: ['type:epic'], ancestors: [], status: 'Todo', priority: 'P1', paths: null, subIssuesSummary: { total: 0, completed: 0 }, blocked: true };
  assert.deepEqual(afkPlan(cfg, [], () => [], 'new-run', { issues: [blockedEpic], prs: [] }).units, [], 'a blocked epic still waits');
});

test('afk start --issue names a missing scope packet when it cannot serve the issue', () => {
  assert.match(afkStartRefusal(6, board(6, 'Todo', ['lane:afk'], { paths: null })).message, /^#6 is not an eligible AFK candidate: it has no valid scope packet/);
  assert.equal(afkStartRefusal(6, board(6, 'Todo')).message, '#6 is not an eligible AFK candidate');
  assert.equal(afkStartRefusal(6, undefined).message, '#6 is not an eligible AFK candidate');
});

test('a Todo build is offered while an open PR a live run works on changes files its packet covers', () => {
  const worked = number => number === 20 ? [{ id: 1, body: '<!-- afk-issue-hold session=live-run -->' }] : [];
  const issues = [epic, board(6, 'Todo', ['lane:afk'], { paths: ['src/feature/'] }), board(7, 'Todo')];
  const plan = afkPlan(cfg, ['live-run'], worked, 'new-run', { issues, prs: [reviewPr(20, { files: [{ path: 'src/feature/a.js' }], labels: [{ name: 'review:owner' }] })] });
  assert.deepEqual(plan.units.filter(unit => !unit.pr).map(unit => unit.issue), [6, 7]);
});

test('a ready PR merges before the tick plans, so no build is held behind it', () => {
  const approved = reviewPr(20, { files: [{ path: 'src/6.js' }], statusCheckRollup: [{ conclusion: 'SUCCESS' }], reviews: [{ author: { login: 'reviewer' }, state: 'APPROVED', commit: { oid: 'abc' }, body: '<!-- agent-review sha=abc verdict=ready -->' }] });
  let open = [approved];
  const gh = args => { if (args[0] === 'pr' && args[1] === 'merge') open = open.filter(pr => String(pr.number) !== args[2]); return { status: 0 }; };
  const tick = afkMergeThenPlan(cfg, { readPrs: () => open, gh, issues: [epic, board(6, 'Todo')] });
  const plan = tick.plan([], () => [], 'new-run');
  assert.deepEqual([tick.merged, plan.units.map(unit => unit.pr ?? unit.issue)], [['PR #20 merged'], [6]]);
});

test('a Todo story without lane:afk or a scope packet gets a refine run, never an implementation', () => {
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, board(2, 'Todo', ['lane:afk'], { paths: null }), board(3, 'Todo', ['lane:proposed']), board(4, 'Todo')], prs: [] });
  assert.deepEqual(plan.units.map(unit => [unit.issue, unit.column, Boolean(unit.refine), unit.paths]), [[2, 'Todo', true, []], [4, 'Todo', false, ['src/4.js']], [3, 'Backlog', true, []]]);
  assert.equal(afkColumn({ labels: ['lane:afk'], status: null }), 'Todo', 'without a board card, lane:afk is Todo');
  assert.equal(afkColumn({ labels: ['lane:proposed'], status: null }), 'Backlog');
});

test('a card In progress with no live run, or in Review with no open PR, is served from Todo again', () => {
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, board(2, 'In progress'), board(3, 'Review')], prs: [] });
  assert.deepEqual([plan.orphans, plan.units.map(unit => [unit.issue, unit.column])], [[2, 3], [[2, 'Todo'], [3, 'Todo']]]);
  const inPr = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, board(3, 'Review')], prs: [reviewPr(20, { body: 'Part of #3' })] });
  assert.deepEqual([inPr.orphans, inPr.units.map(unit => unit.pr ?? unit.issue)], [[], [20]], 'its PR is the unit');
});

test('an attended state:started card is never orphaned or offered, while an abandoned state:claimed card is recovered', () => {
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, board(2, 'In progress', ['lane:afk', 'state:started']), board(3, 'Todo', ['lane:afk', 'state:started']), board(4, 'In progress', ['lane:afk', 'state:claimed']), board(5, 'Blocked', ['lane:afk', 'state:started']), board(6, 'Backlog', ['lane:proposed', 'state:started'])], prs: [] });
  assert.deepEqual([plan.orphans, plan.units.map(unit => [unit.issue, unit.column])], [[4], [[4, 'Todo']]]);
  const withPr = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, board(7, 'Review', ['lane:afk', 'state:started'])], prs: [reviewPr(20, { body: 'Part of #7' })] });
  assert.deepEqual(withPr.units, [], 'an attended issue\'s open PR is not offered either');
});

test('an attended hold ends with its session: held by a live session or inside the grace window, released and served otherwise', () => {
  const now = Date.parse('2026-11-03T12:00:00Z'), old = '2026-11-03T10:00:00Z', fresh = '2026-11-03T11:50:00Z';
  const plan = (startedAt, sessions, prs = []) => afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, board(2, 'In progress', ['lane:afk', 'state:started'], { startedAt })], prs, sessions, now });
  const held = plan(old, [{ cwd: '/w/a', branch: '2-fix-it' }]);
  assert.deepEqual([held.released, held.units], [[], []], 'a live session on its branch holds it');
  const gone = plan(old, [{ cwd: '/w/b', branch: '20-other' }]);
  assert.deepEqual([gone.released, gone.units.map(unit => unit.issue)], [[2], [2]], 'no session holds it: released and offered');
  const young = plan(fresh, []);
  assert.deepEqual([young.released, young.units], [[], []], 'inside the grace window it is held');
  assert.deepEqual(plan(old, null).released, [], 'unlistable sessions release nothing');
  const withPr = plan(old, [], [reviewPr(20, { body: 'Part of #2', statusCheckRollup: [{ conclusion: 'FAILURE' }], isDraft: true })]);
  assert.deepEqual([withPr.released, withPr.units.map(unit => unit.pr)], [[2], [20]], 'its red PR becomes a fix unit');
  assert.deepEqual(afkAttendedSessions(() => JSON.stringify([{ cwd: '/w/a', state: 'running' }, { cwd: '/w/b', state: 'done' }, { state: 'running' }]), cwd => `${cwd.slice(-1)}-x`), [{ cwd: '/w/a', branch: 'a-x' }]);
});

test('a release removes the label, comments why and logs it; a failed release is logged and the rest go on; a missing label event or branch lookup failure is not a live hold', () => {
  const calls = [];
  const lines = afkReleaseAttended(cfg, [2, 3], (command, args) => { calls.push(args.join(' ')); if (args[2] === '2' && args[1] === 'comment') throw new Error('boom'); });
  assert.deepEqual(lines, ["Release of #2's attended hold failed: boom", "Released: #3's attended hold; no live session holds it"]);
  assert.ok(calls.includes('issue edit 3 --repo acme/app --remove-label state:started') && calls.some(call => call.startsWith('issue comment 3 ')));
  const now = Date.parse('2026-11-03T12:00:00Z');
  const noEvent = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, board(2, 'Todo', ['lane:afk', 'state:started'])], prs: [], sessions: [], now });
  assert.deepEqual(noEvent.released, [2], 'no label event reads as an old label');
  assert.equal(afkAttendedSessions(() => '{bad'), null);
  assert.equal(afkAttendedSessions(() => JSON.stringify([{ cwd: '/x', state: 'running' }]), () => { throw new Error('gone'); }), null, 'an unreadable branch leaves every hold in place');
});

test('an epic is served only to slice it or to close it once every slice closed', () => {
  const epicAt = (status, total, completed) => ({ number: 30, labels: ['type:epic'], ancestors: [], status, priority: 'P1', paths: null, subIssuesSummary: { total, completed } });
  const units = record => afkPlan(cfg, [], () => [], 'new-run', { issues: [record], prs: [] }).units.map(unit => [unit.column, unit.refine, unit.text]);
  assert.deepEqual(units(epicAt('Todo', 0, 0)), [['Todo', true, 'epic #30 is in Todo: slice it if it has no sub-issues, otherwise verify its delivery and close it']]);
  assert.deepEqual(units(epicAt('In progress', 3, 1)), []);
  assert.equal(units(epicAt('In progress', 3, 3)).length, 1, 'all slices closed brings it back');
  assert.equal(units(epicAt('In progress', 0, 0)).length, 1, 'an approved epic In progress with no slices is sliced');
  assert.deepEqual(units({ ...epicAt('Todo', 0, 0), labels: ['type:epic', 'lane:owner'] }), [], 'a draft epic waits for the owner');
});

test('an issue a finished run left unchanged gets no new run; a Blocked one is retried after the next merge', () => {
  const workflowCfg = { ...cfg, implementer: 'builder' };
  const blocked = board(6, 'Blocked', ['lane:afk'], { lastEditedAt: '2026-10-01T00:00:00Z' });
  const spent = { 6: afkIssueState(blocked, 'Blocked', [], workflowCfg, 'base1') };
  const plan = (record, comments = [], base = 'base1') => afkPlan(workflowCfg, [], () => comments, 'new-run', { issues: [epic, record], prs: [], spent, base });
  assert.deepEqual([plan(blocked).units, plan(blocked).unchanged], [[], [6]]);
  assert.deepEqual(plan(blocked, [{ id: 1, user: { login: 'builder' }, body: 'Still blocked on #285' }]).units, [], 'the workflow\'s own notes are not new input');
  assert.equal(plan(blocked, [], 'base2').units.length, 1, 'a new base head');
  assert.equal(plan(blocked, [{ id: 2, user: { login: 'owner' }, body: 'Use the old API' }]).units.length, 1, 'an owner comment');
  assert.equal(plan({ ...blocked, lastEditedAt: '2026-10-02T00:00:00Z' }).units.length, 1, 'an edit');
  assert.equal(plan({ ...blocked, status: 'Todo' }).units.length, 1, 'a new column');
  const todo = board(7, 'Todo', ['lane:afk']);
  assert.equal(afkIssueState(todo, 'Todo', [], workflowCfg, 'base1'), afkIssueState(todo, 'Todo', [], workflowCfg, 'base2'), 'a ready story never reads the base head');
});

test('a sliced epic comes back for its close check once its slices close, and a waiting close check after the next merge', () => {
  const at = (status, total, completed) => ({ number: 30, labels: ['type:epic'], ancestors: [], status, priority: 'P1', paths: null, lastEditedAt: '2026-10-01T00:00:00Z', subIssuesSummary: { total, completed } });
  const plan = (record, spent, base = 'base1') => afkPlan(cfg, [], () => [], 'new-run', { issues: [record], prs: [], spent, base });
  const sliced = { 30: plan(at('Todo', 0, 0), {}).units[0].state };
  assert.deepEqual(plan(at('Todo', 0, 0), sliced).unchanged, [30], 'a slicing run that changed nothing is not rerun');
  assert.equal(plan(at('In progress', 3, 3), sliced).units.length, 1, 'all slices closed after slicing');
  assert.equal(plan(at('Todo', 3, 3), sliced).units.length, 1, 'all slices closed, card left in Todo');
  const waiting = { 30: plan(at('In progress', 3, 3), {}).units[0].state };
  assert.deepEqual(plan(at('In progress', 3, 3), waiting).unchanged, [30], 'a close check waiting on a deployment');
  assert.equal(plan(at('In progress', 3, 3), waiting, 'base2').units.length, 1, 'is retried after the next merge');
  const workflowCfg = { ...cfg, implementer: 'builder' }, note = [{ id: 3, user: { login: 'builder' }, body: 'Waiting on the test deployment of base1' }];
  const commented = afkPlan(workflowCfg, [], () => note, 'new-run', { issues: [at('In progress', 3, 3)], prs: [], spent: { 30: afkIssueState(at('In progress', 3, 3), 'Todo', [], workflowCfg, 'base1') }, base: 'base1' });
  assert.deepEqual(commented.unchanged, [30], 'the run\'s own wait comment is not new input');
});

test('an implementation run that ends with its PR open goes to Review, one without a PR to Blocked; else Todo', () => {
  assert.deepEqual([afkEndStatus(true, false), afkEndStatus(false, true), afkEndStatus(false, false)], ['REVIEW', 'BLOCKED', 'TODO']);
  const pr = extra => afkPrRecord({ number: 1095, title: 'Fix', body: 'Closes #8', headRefOid: 'head726', labels: [], statusCheckRollup: [], mergeable: 'MERGEABLE', reviews: [], ...extra }, cfg);
  const note = afkOpenPrNote('afk-1', pr(), 'base123');
  assert.match(note, /^\*\*In review:\*\* run afk-1 ended with PR #1095 open/);
  assert.match(note, /head `head726`/);
  assert.match(note, /review: awaiting the Reviewer at this head/);
  assert.match(note, /checks: green/);
  assert.match(note, /merge state: mergeable/);
  assert.match(note, /base head `base123`/);
  const approval = { author: { login: 'reviewer' }, state: 'APPROVED', commit: { oid: 'head726' }, body: '<!-- agent-review sha=head726 verdict=ready -->' };
  assert.match(afkOpenPrNote('afk-1', pr({ reviews: [approval] }), 'b'), /review: approved at this head/);
  const ownerApproval = { ...approval, body: '<!-- agent-review sha=head726 verdict=owner -->' }, ownerLane = [{ name: 'review:owner' }];
  assert.match(afkOpenPrNote('afk-1', pr({ reviews: [ownerApproval], labels: ownerLane }), 'b'), /review: approved at this head; waiting for the owner's approval \(`review:owner`\);/);
  const ownerSigned = { author: { login: cfg.owner }, state: 'APPROVED', commit: { oid: 'head726' }, body: '' };
  assert.doesNotMatch(afkOpenPrNote('afk-1', pr({ reviews: [ownerApproval, ownerSigned], labels: ownerLane }), 'b'), /waiting for the owner/);
  assert.doesNotMatch(afkOpenPrNote('afk-1', pr({ reviews: [approval] }), 'b'), /waiting for the owner/);
  assert.match(afkOpenPrNote('afk-1', pr({ reviews: [{ ...approval, state: 'DISMISSED' }] }), 'b'), /review: approval dismissed; awaiting the Reviewer at this head/);
  assert.match(afkOpenPrNote('afk-1', pr({ statusCheckRollup: [{ status: 'IN_PROGRESS', conclusion: '' }], mergeable: 'CONFLICTING' }), 'b'), /checks: pending.*merge state: conflicting/);
  assert.match(afkOpenPrNote('afk-1', pr({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }), 'b'), /checks: red/);
});

test('a dismissed approval is not reported as Unchanged: the PR is served for a fresh review', () => {
  const approval = { author: { login: 'reviewer' }, state: 'APPROVED', commit: { oid: 'head726' }, body: '<!-- agent-review sha=head726 verdict=ready -->' };
  const pr = reviews => ({ number: 1095, title: 'Fix', body: 'No linked issue.', headRefOid: 'head726', labels: [], statusCheckRollup: [], mergeable: 'MERGEABLE', files: [{ path: 'src/a.js' }], reviews });
  const dismissed = pr([{ ...approval, state: 'DISMISSED' }]);
  const record = afkPrRecord(dismissed, cfg);
  assert.equal(record.approved, false);
  assert.equal(record.awaitingReview, true, 'a dismissed review does not count as reviewing the head');
  const spent = { 1095: afkPrState(afkPrRecord(pr([approval]), cfg), [], cfg, 'base1') };
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues: [], prs: [dismissed], spent, base: 'base1' });
  assert.deepEqual(plan.unchanged, []);
  assert.deepEqual(plan.units.map(unit => [unit.pr, Boolean(unit.review)]), [[1095, true]]);
  assert.notEqual(afkPrState(afkPrRecord(pr([approval]), cfg), [], cfg, 'b'), afkPrState(record, [], cfg, 'b'), 'a dismissal changes the state key though the review count does not');
});

test('a run that splits its held issue builds the first sub-issue while its hold keeps the others and their PRs from other runs', () => {
  const parent = { number: 40, labels: ['type:epic'], ancestors: [], status: 'In progress', priority: 'P1', paths: null, subIssuesSummary: { total: 2, completed: 0 } };
  const first = board(41, 'Todo', ['lane:afk'], { ancestors: [40] }), second = board(42, 'Todo', ['lane:afk'], { ancestors: [40], blocked: true }), third = board(43, 'Todo', ['lane:afk'], { ancestors: [40] });
  const pr = reviewPr(50, { body: 'Closes #41', closingIssuesReferences: [{ number: 41, repository: { name: 'app', owner: { login: 'acme' } } }] });
  const comments = new Map([[40, [{ id: 1, body: '<!-- afk-issue-hold session=splitter -->' }]]]);
  const plan = (live, record = parent) => afkPlan(cfg, live, number => comments.get(number) || [], 'new-run', { issues: [record, first, second, third], prs: [pr] }).units.map(unit => unit.pr ?? unit.issue);
  assert.deepEqual(plan(['splitter']), [], 'neither a ready sub-issue nor a sub-issue\'s PR goes to another run');
  assert.deepEqual(plan([]), [50, 43], 'once the hold ends, the PR and the ready sub-issue are served; a blocked one waits');
  assert.deepEqual(plan(['splitter'], { ...parent, status: null }), [], 'without a board card the hold still covers the sub-issues');
  assert.deepEqual(plan(['splitter'], { ...parent, status: 'Blocked' }), [50, 43], 'a refine hold on a Blocked epic keeps back only the epic');
  const grand = { ...parent, number: 39, subIssuesSummary: { total: 1, completed: 0 } };
  const nested = afkPlan(cfg, ['elder'], number => (number === 39 ? [{ id: 2, body: '<!-- afk-issue-hold session=elder -->' }] : []), 'new-run', { issues: [grand, { ...parent, ancestors: [39] }, { ...third, ancestors: [40, 39] }], prs: [] }).units.map(unit => unit.issue);
  assert.deepEqual(nested, [43], 'a hold on a grandparent covers no grandchild');
  assert.deepEqual(afkEndCards(40, [41, 42], new Set([41]), false), [[40, 'PROGRESS'], [41, 'REVIEW']], 'the parent epic stays In progress and the built sub-issue, its PR still open, goes to Review');
  assert.deepEqual(afkEndCards(40, [41, 42], new Set(), true), [[40, 'PROGRESS']], 'without a PR the sub-issues stay Todo for the next run');
  assert.deepEqual(afkEndCards(7, [], new Set([7]), false), [[7, 'REVIEW']], 'an issue that was not split goes to Review while its PR is open');
});

test('AFK eligibility records post as the configured Reviewer, not through the credential-stripping CLI', () => {
  const skill = name => readFileSync(new URL(`../../plugins/common/workflow/skills/${name}/SKILL.md`, import.meta.url), 'utf8');
  const assignments = readFileSync(new URL('../../plugins/common/workflow/skills/review/references/assignments.md', import.meta.url), 'utf8');
  assert.match(assignments, /Run each `gh` call as `GH_TOKEN=\$\(gh auth token --user <identities.reviewer>\) gh \.\.\.`[^\n]*Post verdicts only with `review-post`/);
  assert.match(skill('afk'), /Write implementer records through the workflow CLI/);
});

test('a clean run spends its issue unit\'s end state, so its own edits do not re-offer it; outside input and a new column or kind do', () => {
  const workflowCfg = { ...cfg, implementer: 'builder' };
  const before = board(6, 'Backlog', ['type:bug'], { lastEditedAt: '2026-10-01T00:00:00Z' });
  const owner = [{ id: 9, user: { login: 'owner' }, body: 'AFK ok' }];
  const plan = (record, spent = {}, comments = []) => afkPlan(workflowCfg, [], () => comments, 'run', { issues: [epic, record], prs: [], spent, base: 'base1' });
  const holdOf = unit => ({ number: unit.issue, column: unit.column, state: unit.state, input: unit.input, ...(unit.refine ? { refine: true } : {}) });
  const held = holdOf(plan(before).units[0]);
  const refined = { ...before, labels: ['type:bug', 'lane:proposed'], lastEditedAt: '2026-10-02T00:00:00Z' };
  const spent = { 6: afkSpentState(held, plan(refined).units) };
  assert.deepEqual([plan(refined, spent).units, plan(refined, spent).unchanged], [[], [6]], 'the run\'s own body and label edits');
  assert.equal(plan(refined, spent, owner).units.length, 1, 'an outside comment after the run');
  assert.equal(afkSpentState(held, plan(refined, {}, owner).units), held.state, 'an outside comment during the run is not spent');
  assert.equal(plan(refined, { 6: afkSpentState(held, plan(refined, {}, owner).units) }, owner).units.length, 1, 'so it is offered again');
  const ready = { ...refined, status: 'Todo', labels: ['type:bug', 'lane:afk'], paths: ['docs/'] };
  assert.equal(afkSpentState(held, plan(ready).units), held.state, 'a refine that moved it keeps the start state');
  assert.equal(plan(ready, { 6: afkSpentState(held, plan(ready).units) }).units.length, 1, 'so the build is offered next');
  const packetless = board(7, 'Todo', ['lane:afk'], { paths: null });
  const refine = holdOf(plan(packetless).units.find(unit => unit.issue === 7));
  const packeted = { ...packetless, paths: ['docs/'], lastEditedAt: '2026-10-03T00:00:00Z' };
  const build = plan(packeted, { 7: afkSpentState(refine, plan(packeted).units) }).units.find(unit => unit.issue === 7);
  assert.ok(build && !build.refine, 'a refine that added the packet in Todo leaves the build offered');
  const fix = { number: 6, pr: 12, column: 'Review', state: 'start' };
  assert.equal(afkSpentState(fix, [{ issue: 6, pr: 12, column: 'Review', state: 'now' }]), 'start', 'a PR unit keeps its start state');
});

test('a run\'s end spends nothing after a crash and falls back to start states when end states are unreadable', () => {
  const held = { number: 6, column: 'Backlog', refine: true, state: 'start', input: '' };
  const now = [{ issue: 6, column: 'Backlog', refine: true, state: 'end', input: '' }];
  let reads = 0;
  assert.deepEqual(afkSpentEntries([held], false, () => { reads++; return now; }), {}, 'a crashed or manual end');
  assert.equal(reads, 0);
  assert.deepEqual(afkSpentEntries([held], true, () => now), { 6: 'end' });
  assert.deepEqual(afkSpentEntries([held], true, () => { throw new Error('GraphQL down'); }), { 6: 'start' });
  assert.deepEqual(afkSpentEntries([{ number: 6, pr: 12, column: 'Review', state: 'head1' }], true, () => { throw new Error('unused'); }), { 12: 'head1' });
});

test('retro filing pauses while open work remains, then takes bugs only', () => {
  const owner = { number: 2, labels: [{ name: 'lane:owner' }] }, held = { number: 9, labels: [] }, other = { number: 4, labels: [{ name: 'lane:afk' }] };
  assert.equal(afkRetroRefusal(undefined, [other], ['type:chore'], 9), null);
  assert.equal(afkRetroRefusal('all', [other], ['type:chore'], 9), null);
  assert.match(afkRetroRefusal('bugs-when-empty', [owner, held, other], ['type:bug'], 9), /paused until the backlog is empty \(1 open/);
  assert.equal(afkRetroRefusal('bugs-when-empty', [owner, held], ['type:bug', 'lane:afk'], 9), null);
  assert.match(afkRetroRefusal('bugs-when-empty', [owner, held], ['type:chore'], 9), /only type:bug/);
  assert.equal(afkCheckRetroMode(undefined), undefined);
  assert.equal(afkCheckRetroMode('bugs-when-empty'), 'bugs-when-empty');
  assert.throws(() => afkCheckRetroMode('bugs'), /afk\.retros must be one of all, bugs-when-empty/);
});

test('afk start names this tick\'s merges at both its Done and its Explore exit', () => {
  const merged = ['PR #1 merged'];
  assert.deepEqual(afkStartIdleLines(false, merged), ['Done: every free piece of work has its runner.', 'PR #1 merged']);
  assert.deepEqual(afkStartIdleLines(true, merged), ['Explore: no work is free for this run; play `explore` unattended.', 'PR #1 merged']);
});

test('a PR the Reviewer claimed is not served while its claim lives; a finished, expired or missing claim frees its state:reviewing label', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const claim = (id, at) => ({ id, created_at: at, user: { login: 'reviewer' }, body: '<!-- agent-review claim sha=abc -->\n**Reviewing:** head `abc`.' });
  const verdict = at => ({ state: 'COMMENTED', submittedAt: at, author: { login: 'reviewer' }, commit: { oid: 'old' }, body: '<!-- agent-review sha=old round=1 verdict=fixes -->' });
  const plan = (comments, reviews = []) => afkPlan(cfg, [], () => comments, 'new-run', { issues: [epic], prs: [reviewPr(20, { labels: [{ name: 'state:reviewing' }], reviews })], now });
  const live = plan([claim(1, '2026-11-04T11:50:00Z')], [verdict('2026-11-04T11:40:00Z')]);
  assert.deepEqual([live.units, live.staleClaims], [[], []], 'a live claim keeps every other run off the PR; an earlier verdict does not end it');
  for (const [why, comments, reviews] of [['verdict posted', [claim(1, '2026-11-04T11:50:00Z')], [verdict('2026-11-04T11:55:00Z')]], ['claim expired', [claim(1, '2026-11-04T10:30:00Z')]], ['no claim', []]]) {
    const stale = plan(comments, reviews);
    assert.deepEqual([stale.staleClaims, stale.units.map(unit => unit.pr)], [[20], [20]], why);
  }
  const failed = { id: 5, created_at: '2026-11-04T11:55:00Z', user: { login: 'reviewer' }, body: '<!-- agent-review post-failed sha=abc --> Review post failed (APPROVE): boom' };
  const afterFailure = plan([claim(1, '2026-11-04T11:50:00Z'), failed]);
  assert.deepEqual([afterFailure.staleClaims, afterFailure.units.map(unit => unit.pr)], [[20], [20]], 'a post-failed comment after the claim ends it');
  assert.deepEqual(plan([failed, claim(6, '2026-11-04T11:56:00Z')]).units, [], 'a failure before a newer claim does not');
  const prState = comments => plan(comments).units[0].state;
  assert.notEqual(prState([]), prState([failed]), 'the failure comment changes the PR state so the run is served again');
  assert.equal(prState([failed, { ...failed, id: 9, created_at: '2026-11-04T11:57:00Z' }]), prState([failed]), 'a repeated failure leaves the state unchanged');
  assert.equal(prState([{ ...failed, created_at: '2026-11-04T10:00:00Z' }, claim(6, '2026-11-04T10:30:00Z')]), prState([]), 'a failure older than the latest claim does not count');
  const unlabelled = afkPlan(cfg, [], () => [claim(1, '2026-11-04T11:50:00Z')], 'new-run', { issues: [epic], prs: [reviewPr(20)], now });
  assert.deepEqual([unlabelled.staleClaims, unlabelled.units.map(unit => unit.pr)], [[], [20]], 'only the label marks a claim');
});

test('releasing a stale review claim removes state:reviewing; a failed release is logged and the rest go on', () => {
  const calls = [];
  const lines = afkReleaseReviewClaims(cfg, [20, 21], (command, args) => { calls.push(args.join(' ')); if (args[2] === '20') throw new Error('boom'); });
  assert.deepEqual(lines, ["Release of PR #20's review claim failed: boom", "Released: PR #21's review claim; no live Reviewer holds it"]);
  assert.ok(calls.includes('pr edit 21 --repo acme/app --remove-label state:reviewing'));
  assert.deepEqual(workflowLabels['state:reviewing'], ['0e8a16', 'The Reviewer is reviewing this PR']);
});
