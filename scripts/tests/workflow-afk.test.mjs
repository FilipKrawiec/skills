import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync, linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prLinkedIssues, afkCandidates, afkSlots, afkStartCount, afkCheckRunLimits, afkPrFiles, afkEndStatus, afkSlices, afkStageFallback, afkStageMarker, afkStageUnrecorded, afkEpicOrder, afkLive, afkLiveHolds, afkLoadEnvironment, afkOneShotLive, afkOtherHolds, afkPlan, afkPrRecord, afkPrState, afkPriority, afkReviewerApproved, afkShow, afkWait, afkPathsFromIssueBody, afkDependenciesFromIssueBody, applyGithubMetadata, assertDistinctPushRoles, githubRepoFromRemote, githubScopeFailure, missingProjectScope, readThroughLocalCache, validateIssueCommentBody, hasLockfAncestor, hasProcessAncestor, oneShotRunId, workflowDefaults, workflowLabels, workflowMetadataCachePath, workspaceFilePath, afkAgentEnvironment, afkPathsWithinScope, afkWorkflowCliPath, afkDefaultStartCommand, afkReleaseRunTree, afkPlistBelongsToWorkflow, afkPluginDir, afkEnsureTooling, afkLauncherSource, githubPushRemoteMatches, needsAbsoluteInvocation, afkRunUsage, afkLaunchAgent, afkDuration, afkReap, afkRunStarted,afkSweepRunTrees, afkRunAlive, afkExcludeWorktrees, afkForeignHeads, afkOwnsHead, issueTargetRepo, oldestExactTitle, assertIssueVisibility } from '../../plugins/common/workflow/scripts/workflow.mjs';

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

test('AFK plan skips live claims and holds but lets a new run take a stale claim', () => {
  const issues = [epic, issue(2, ['lane:afk']), issue(3, ['lane:afk']), issue(4, ['lane:afk']), issue(5, ['lane:afk'])];
  const comments = new Map([
    [3, [{ body: '<!-- afk-claim session=live-run -->' }]],
    [4, [{ body: '<!-- afk-claim session=finished-run -->' }]],
    [5, [{ id: 1, body: '<!-- afk-issue-hold session=live-run -->' }, { id: 2, body: '<!-- afk-claim session=finished-run -->' }]],
  ]);
  const plan = afkPlan(cfg, ['live-run'], number => comments.get(number) || [], 'new-run', { issues, prs: [] });
  assert.deepEqual(plan.epics[0].units.map(unit => unit.issue), [2, 4]);
});

test('AFK plan offers no review of a PR whose linked issue a live run holds', () => {
  const pr = (number, linked) => ({ number, title: `PR ${number}`, body: `Closes #${linked}`, closingIssuesReferences: [{ number: linked, repository: { name: 'app', owner: { login: 'acme' } } }], headRefOid: 'abc', labels: [], reviews: [], statusCheckRollup: [], mergeable: 'MERGEABLE' });
  const loose = { ...issue(5, ['lane:afk']), ancestors: [] };
  const comments = new Map([[5, [{ body: '<!-- afk-issue-hold session=live-run -->' }]]]);
  const plan = afkPlan(cfg, ['live-run'], number => comments.get(number) || [], 'new-run', { issues: [epic, loose, issue(6, ['lane:afk'])], prs: [pr(10, 5), pr(11, 6)] });
  assert.deepEqual(plan.epics[0].units.map(unit => unit.text), ['PR #11 (PR 11) awaits its review']);
});

test('AFK plan blocks an issue whose packet depends on an open PR until that PR merges', () => {
  assert.deepEqual(afkDependenciesFromIssueBody('```scope\n{"paths":["src/"],"dependencies":["#285", 12, "x"]}\n```'), [285, 12]);
  assert.deepEqual(afkDependenciesFromIssueBody('no packet'), []);
  const follow = issue(6, ['lane:afk'], { dependencies: [285] });
  const open = { number: 285, title: 'Ledger', body: '', headRefOid: 'abc', labels: [], reviews: [], statusCheckRollup: [], mergeable: 'CONFLICTING' };
  const blocked = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, follow], prs: [open] });
  assert.equal(blocked.epics[0].units.some(unit => unit.issue === 6), false);
  assert.deepEqual(blocked.blocks, [{ issue: 6, pr: 285 }]);
  const merged = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, follow], prs: [] });
  assert.deepEqual(merged.epics[0].units.map(unit => unit.text), ['#6 is ready']);
  assert.deepEqual(merged.blocks, []);
});

test('AFK plan offers no lane:afk issue without a valid scope packet and lists it for refinement', () => {
  const issues = [epic, issue(2, ['lane:afk'], { paths: null }), issue(3, ['lane:afk'], { paths: [] }), issue(4, ['lane:afk'])];
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues, prs: [] });
  assert.deepEqual(plan.epics[0].units.map(unit => unit.issue), [3, 4]);
  assert.deepEqual(plan.refines, [2]);
});

test('afk check reports an issue blocked on an open PR and offers it once the PR merges', t => {
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
  assert.equal(open.status, 3, `${open.stdout}\n${open.stderr}`);
  assert.match(open.stdout, /Done: no new run has work[^\n]*\nWait: #1082 is blocked until PR #285 merges\nRefine: #1083 has lane:afk but no valid scope packet/);
  const merged = check(false);
  assert.equal(merged.status, 0, `${merged.stdout}\n${merged.stderr}`);
  assert.match(merged.stdout, /^Start: 1\n/);
  assert.doesNotMatch(merged.stdout, /blocked until PR/);
  assert.match(merged.stdout, /Refine: #1083 has lane:afk but no valid scope packet/);
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

test('candidate selection honors live holds and work sharing', () => {
  const epics = [{ issue: { number: 1 }, units: [
    { issue: 2, paths: ['src/2.js'] }, { issue: 3, paths: ['src/3.js'] },
  ] }];
  const held = [...afkCandidates(epics, [{ number: 2, epic: 1, paths: ['src/2.js'] }], true, () => false)];
  assert.deepEqual(held.map(item => item.number), [3]);
  assert.deepEqual([...afkCandidates(epics, [], true, () => true)], []);
});

test('free runs go to blockers, then reviews, then PRs in progress, then new issues, in any epic', () => {
  const epics = [
    { issue: { number: 1 }, units: [{ issue: 2, paths: ['src/2.js'] }, { issue: 6, paths: ['src/6.js'], rank: 2 }] },
    { issue: { number: 4 }, units: [{ issue: 5, paths: ['src/5.js'] }, { issue: 9, paths: [], review: true, rank: 1 }, { issue: 7, paths: ['src/7.js'], rank: 0 }] },
  ];
  assert.deepEqual([...afkCandidates(epics, [], true, () => false)].map(item => item.number), [7, 9, 6, 2, 5]);
  assert.deepEqual([...afkCandidates(epics, [{ number: 9, epic: 4, paths: [] }], true, () => false)].map(item => item.number), [7, 6, 2, 5]);
  assert.deepEqual([...afkCandidates(epics, [], false, () => false)].map(item => item.number), [1, 4], 'without sharing, one run per epic');
});

test('reviews have their own run slots, so ticket runs never block them', () => {
  const ledger = { a: [{ number: 1 }], b: [{ number: 2 }], r: [{ number: 3, review: true }] };
  const review = { unit: { review: true } }, ticket = { unit: {} };
  const slots = afkSlots({ maxRuns: 2, maxReviewRuns: 2 }, ledger, ['a', 'b', 'r']);
  assert.equal(slots.full(), false);
  assert.equal(slots.take(ticket), false, 'both work slots are busy');
  assert.equal(slots.take(review), true, 'a review still starts');
  assert.equal(slots.take(review), false, 'until its own slots are full');
  assert.equal(slots.full(), true);
  assert.equal(afkSlots({ maxRuns: 4 }, {}, []).take(review), true, 'two review slots by default');
});

test('a new ticket starts only while open PRs and ticket runs without a PR stay under afk.maxRuns', () => {
  const ticket = { unit: {} }, fix = { unit: { rank: 2 } }, blocker = { unit: { rank: 0 } };
  const prs = [{ number: 10, issues: [1] }, { number: 11, issues: [] }];
  const ledger = { a: [{ number: 1 }], b: [{ number: 5 }] };
  const slots = afkSlots({ maxRuns: 4 }, ledger, ['a', 'b'], '', prs);
  assert.equal(slots.take(ticket), true, 'WIP is 2 PRs + 1 ticket run without a PR = 3');
  assert.equal(slots.take(ticket), false, 'WIP reached 4; finish work before starting more');
  assert.equal(slots.take(fix), true, 'work on an open PR uses the last run slot');
  assert.equal(slots.take(blocker), false, 'all four run slots are busy');
  const free = afkSlots({ maxRuns: 4 }, {}, [], '', [{ number: 10 }, { number: 11 }, { number: 12 }, { number: 13 }]);
  assert.equal(free.take(ticket), false, 'four open PRs: no new ticket');
  assert.equal(free.take(blocker), true, 'work on an open PR still starts');
});

test('eligibility checks and epic stages start and add no WIP when WIP is full', () => {
  const four = [{ number: 10 }, { number: 11 }, { number: 12 }, { number: 13 }];
  const full = afkSlots({ maxRuns: 4 }, {}, [], '', four);
  assert.equal(full.take({ unit: { check: true } }), true, 'WIP is 4, yet an eligibility check starts');
  assert.equal(full.take({ unit: { stage: 'close' } }), true, 'and so does an epic stage');
  assert.equal(full.take({ unit: {} }), false, 'a new ticket waits');
  const checking = afkSlots({ maxRuns: 5 }, { c: [{ number: 7, check: true }] }, ['c'], '', four);
  assert.equal(checking.take({ unit: {} }), true, 'a live check hold alone adds no WIP');
  const staging = afkSlots({ maxRuns: 5 }, { s: [{ number: 8, stage: 'slice' }] }, ['s'], '', four);
  assert.equal(staging.take({ unit: {} }), true, 'a live stage hold alone adds no WIP');
});

test('draft PRs count as WIP, and a held-back ticket says why', () => {
  const drafts = [10, 11, 12, 13].map(number => ({ number, isDraft: true }));
  const slots = afkSlots({ maxRuns: 4 }, {}, [], '', drafts);
  assert.equal(slots.waiting(), null);
  assert.equal(slots.take({ unit: {} }), false, 'four draft PRs: no new ticket');
  assert.equal(slots.waiting(), 'Waiting: WIP 4/4; no new ticket');
  assert.equal(afkStartCount({ maxRuns: 4 }, {}, [], [{ unit: {} }], drafts).waiting, 'Waiting: WIP 4/4; no new ticket');
});

test('a booting run takes no slot when a peer starts, and covers one chosen candidate in the start count', () => {
  const ledger = { a: [{ number: 1 }], b: [{ number: 2 }], c: [{ number: 3 }] };
  const live = ['a', 'b', 'c', 'boot'];
  assert.equal(afkSlots({ maxRuns: 4 }, ledger, live, 'me').take({ unit: {} }), true, 'the booting peer does not take the last slot from this run');
  const tickets = [{ unit: {} }, { unit: {} }];
  assert.deepEqual(afkStartCount({ maxRuns: 4 }, ledger, live, tickets, []), { count: 0, waiting: null }, 'the booting run takes the one free run slot');
  assert.equal(afkStartCount({ maxRuns: 5 }, ledger, live, tickets, []).count, 1);
  assert.equal(afkStartCount({ maxRuns: 5 }, ledger, live, [{ unit: { review: true } }], []).count, 1, 'reviews have their own slots');
});

test('run limits must be positive integers', () => {
  assert.doesNotThrow(() => afkCheckRunLimits({ maxRuns: 4, maxReviewRuns: 2 }));
  assert.throws(() => afkCheckRunLimits({ maxRuns: 4, maxReviewRuns: 0 }), /afk\.maxReviewRuns must be a positive integer/);
  assert.throws(() => afkCheckRunLimits({ maxRuns: 0, maxReviewRuns: 2 }), /afk\.maxRuns must be a positive integer/);
});

test('the plan ranks a red PR, a PR awaiting review and a PR with requested changes for selection', () => {
  const pr = (number, extra) => ({ number, title: `PR ${number}`, body: 'No linked issue.', headRefOid: 'abc', labels: [], files: [{ path: 'src/a.js' }], statusCheckRollup: [], mergeable: 'MERGEABLE', reviews: [{ author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', commit: { oid: 'abc' }, body: '' }], ...extra });
  const prs = [pr(20), pr(21, { reviews: [] }), pr(22, { statusCheckRollup: [{ conclusion: 'FAILURE' }] })];
  const plan = afkPlan(cfg, [], () => [], 'new-run', { issues: [epic, issue(2, ['lane:afk'])], prs });
  assert.deepEqual(Object.fromEntries(plan.epics[0].units.map(unit => [unit.issue, unit.rank])), { 2: undefined, 20: 2, 21: 1, 22: 0 });
  assert.deepEqual([...afkCandidates(plan.epics, [], true, () => false)].map(item => item.number), [22, 21, 20, 2]);
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

test('a PR a finished run left unchanged gets no new run until its head, reviews, checks or an outside comment change', () => {
  const pr = extra => ({ number: 9, title: 'Fix', body: 'No linked issue.', headRefOid: 'abc', labels: [], reviews: [{ author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', commit: { oid: 'abc' }, body: '' }], statusCheckRollup: [], mergeable: 'MERGEABLE', files: [{ path: 'src/a.js' }], ...extra });
  const workflowCfg = { ...cfg, implementer: 'builder' };
  const plan = (record, comments = [], spentComments = []) => {
    const spent = { 9: afkPrState(afkPrRecord(pr(), workflowCfg), spentComments, workflowCfg) };
    return afkPlan(workflowCfg, [], number => number === 9 ? comments : [], 'new-run', { issues: [epic], prs: [record], spent });
  };
  const unchanged = plan(pr());
  assert.deepEqual(unchanged.epics[0].units, []);
  assert.deepEqual(unchanged.unchanged, [9]);
  const runNotes = [{ id: 5, user: { login: 'builder' }, body: 'Round-2 notes' }, { id: 6, user: { login: 'builder' }, body: '<!-- afk-issue-released session=afk-1 -->' }];
  assert.deepEqual(plan(pr(), runNotes).epics[0].units, [], 'the workflow\'s own comments are not new input');
  const offered = record => plan(record).epics[0].units.map(unit => unit.issue);
  assert.deepEqual(offered(pr({ headRefOid: 'def' })), [9], 'a new head is reviewed');
  assert.deepEqual(offered(pr({ reviews: [...pr().reviews, { author: { login: 'owner' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: '' }] })), [9], 'a new review');
  assert.deepEqual(offered(pr({ statusCheckRollup: [{ conclusion: 'FAILURE' }] })), [9], 'a red check');
  assert.deepEqual(plan(pr(), [{ id: 7, user: { login: 'owner' }, body: 'Please also cover X' }]).epics[0].units.map(unit => unit.issue), [9], 'an owner comment');
  const fresh = afkPlan(workflowCfg, [], () => [], 'new-run', { issues: [epic], prs: [pr()] }).epics[0].units[0];
  assert.deepEqual([fresh.pr, fresh.state], [9, 'abc:1:green:'], 'the unit carries the state its run will spend');
});

test('a red PR unit takes its scope from its packet, else its changed files', () => {
  const red = (body, extra = {}) => ({ number: 9, title: 'Fix', body, headRefOid: 'abc', labels: [], isDraft: false, mergeable: 'CONFLICTING', reviews: [{ author: { login: cfg.reviewer }, commit: { oid: 'abc' }, state: 'COMMENTED' }], files: [{ path: 'src/a.js' }, { path: 'docs/b.md' }], ...extra });
  const paths = (pr, issues = [epic]) => afkPlan(cfg, [], () => [], 'new-run', { issues, prs: [pr] }).epics[0].units[0].paths;
  assert.deepEqual(paths(red('No linked issue.')), ['src/a.js', 'docs/b.md']);
  assert.deepEqual(paths(red('```scope\n{"paths":["src/"]}\n```')), ['src/'], 'the PR body packet wins');
  assert.deepEqual(paths(red('Part of #2'), [epic, issue(2, ['lane:afk'])]), ['src/2.js'], 'the linked issue packet wins');
  assert.deepEqual(paths(red('Part of #2\n```scope\n{"paths":["src/"]}\n```'), [epic, issue(2, ['lane:afk'])]), ['src/2.js'], 'a PR packet cannot widen its issue packet');
  assert.deepEqual(paths(red('Part of #2'), [epic, issue(2, ['lane:afk'], { paths: [] })]), [], 'a linked empty scope stays empty');
  assert.deepEqual(paths(red('Part of #2', { files: [{ path: 'src/new.js', previousPath: 'src/old.js' }] }), [epic, issue(2, ['lane:afk'], { paths: null })]), ['src/new.js', 'src/old.js'], 'a rename keeps its source');
  const byFiles = (pr, issues = [epic]) => afkPlan(cfg, [], () => [], 'new-run', { issues, prs: [pr] }).epics[0].units[0].scopedByFiles;
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
  const units = prs => afkPlan(cfg, [], () => [], 'new-run', { issues: [epic], prs }).epics[0].units;
  const fixes = units([pr(9, unread), pr(10, readOf({ number: 10, files: [{ path: 'src/b.js' }] }))]);
  assert.deepEqual(fixes.map(unit => [unit.issue, unit.paths]), [[10, ['src/b.js']]]);
  assert.deepEqual(units([pr(9, { ...unread, body: '```scope\n{"paths":["src/"]}\n```' })]).map(unit => unit.paths), [['src/']], 'a PR packet still scopes it');
  const awaiting = units([pr(9, { ...unread, reviews: [], statusCheckRollup: [] })]);
  assert.deepEqual(awaiting.map(unit => [unit.issue, unit.review]), [[9, true]], 'its review still runs');
});

test('an issue waiting for its retry time stays out of selection until that time', () => {
  const until = '2026-11-02T15:00:00Z', at = Date.parse(until);
  const wait = { user: { login: 'builder' }, body: `<!-- afk-wait until=${until} cause=measurement window -->\nRetry after the window closes.` };
  const plan = (now, comments = [wait]) => afkPlan({ ...cfg, implementer: 'builder', maxRuns: 2 }, [], number => number === 7 ? comments : [], 'new-run', { issues: [epic, issue(7, ['lane:afk']), issue(8, ['lane:afk'])], prs: [], now });
  const picks = now => [...afkCandidates(plan(now).epics, [], true, () => false)].map(candidate => candidate.number);
  assert.deepEqual(picks(at - 1), [8]);
  assert.deepEqual(plan(at - 1).waits, [{ issue: 7, until, cause: 'measurement window' }]);
  assert.deepEqual(picks(at), [7, 8]);
  assert.deepEqual(picks(at + 1), [7, 8]);
  assert.deepEqual(plan(at).waits, []);
  const claimed = [wait, { user: { login: 'builder' }, body: '<!-- afk-issue-hold session=later-run -->' }];
  assert.deepEqual(plan(at - 1, claimed).epics[0].units.map(unit => unit.issue), [7, 8], 'a later claim supersedes the wait');
});

test('a lone waiting issue starts no run and only a well-formed trusted marker hides it', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const units = comments => afkPlan({ ...cfg, implementer: 'builder' }, [], () => comments, 'new-run', { issues: [epic, issue(7, ['lane:afk'])], prs: [], now }).epics;
  const marker = (until, login = 'builder', cause = 'deadline') => ({ user: { login }, body: `<!-- afk-wait until=${until} cause=${cause} -->` });
  assert.deepEqual([...afkCandidates(units([marker('2026-11-03T00:00Z')]), [], true, () => false)], []);
  for (const comments of [[marker('tomorrow')], [marker('2026-02-30T00:00:00Z')], [marker('2026-11-03T00:00:00+02:00')], [marker('2026-11-03T00:00:00Z', 'stranger')], [{ user: { login: 'builder' }, body: '<!-- afk-wait until=2026-11-03T00:00:00Z -->' }], [marker('2026-11-03T00:00:00Z'), marker('2026-13-01T00:00:00Z')]]) {
    assert.equal(units(comments)[0].units.length, 1, comments.at(-1).body);
  }
  assert.deepEqual(afkWait([marker('2026-11-03T00:00:00Z', 'owner')], ['builder', 'reviewer', 'owner'], now), { until: '2026-11-03T00:00:00Z', cause: 'deadline' });
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

test('an epic whose sub-issues all closed queues one delivery check until it records a verdict or changes', () => {
  const done = (extra = {}) => ({ ...epic, lastEditedAt: '2026-10-01T00:00:00Z', subIssuesSummary: { total: 2, completed: 2 }, ...extra });
  const units = (target, comments = [], prs = []) => afkPlan({ ...cfg, implementer: 'builder' }, [], number => number === 1 ? comments : [], 'new-run', { issues: [target], prs }).epics[0].units;
  const [unit] = units(done());
  assert.deepEqual({ issue: unit.issue, paths: unit.paths, stage: unit.stage }, { issue: 1, paths: [], stage: 'close' });
  assert.match(unit.text, /^epic #1 has every sub-issue closed/);
  assert.deepEqual(units(done({ subIssuesSummary: { total: 2, completed: 1 } })), [], 'open slices remain');
  assert.deepEqual(units(done(), [], [{ number: 9, title: 'x', body: 'Part of #1', headRefOid: 'a', labels: [], reviews: [] }]).filter(item => item.stage), [], 'an open PR still works on it');
  const verdict = { user: { login: 'builder' }, created_at: '2026-10-02T00:00:00Z', body: '<!-- epic-check stage=close slices=2/2 verdict=owner -->\nCriterion 2 needs the owner.' };
  assert.deepEqual(units(done(), [verdict]), [], 'a recorded verdict waits for a change');
  assert.equal(units(done(), [verdict, { user: { login: 'owner' }, created_at: '2026-10-03T00:00:00Z', body: 'Evidence is in #12.' }]).length, 1);
  assert.equal(units(done({ lastEditedAt: '2026-10-03T00:00:00Z' }), [verdict]).length, 1);
  assert.equal(units(done(), [{ ...verdict, user: { login: 'stranger' } }]).length, 1, 'only a workflow identity records a verdict');
  const [candidate] = afkCandidates([{ issue: done(), units: units(done()) }], [], true, () => false);
  assert.deepEqual({ number: candidate.number, epic: candidate.epic, paths: candidate.paths }, { number: 1, epic: 1, paths: [] });
});

test('a delivery check that leaves its epic open returns it to In progress, never Blocked or Todo', () => {
  assert.equal(afkEndStatus({ stage: 'close' }, false, false), 'PROGRESS');
  assert.equal(afkEndStatus({ stage: 'slice' }, false, false), 'PROGRESS');
  assert.equal(afkEndStatus({}, true, false), 'REVIEW');
  assert.equal(afkEndStatus({}, false, true), 'BLOCKED');
  assert.equal(afkEndStatus({}, false, false), 'TODO');
});

test('an approved epic without sub-issues queues one slicing run, while a draft waits for the owner', () => {
  const empty = labels => ({ ...epic, labels: ['type:epic', ...labels], lastEditedAt: '2026-10-01T00:00:00Z', subIssuesSummary: { total: 0, completed: 0 } });
  const units = (target, comments = []) => afkPlan({ ...cfg, implementer: 'builder' }, [], () => comments, 'new-run', { issues: [target], prs: [] }).epics[0].units;
  const [unit] = units(empty([]));
  assert.deepEqual({ issue: unit.issue, paths: unit.paths, stage: unit.stage }, { issue: 1, paths: [], stage: 'slice' });
  assert.match(unit.text, /^epic #1 is approved and has no sub-issues; slice it/);
  assert.deepEqual(units(empty(['lane:owner'])), [], 'a draft epic awaits the owner');
  assert.deepEqual(units(empty([]), [{ user: { login: 'builder' }, created_at: '2026-10-02T00:00:00Z', body: '<!-- epic-check stage=slice slices=0/0 verdict=owner -->' }]), [], 'a recorded verdict waits for a change');
  assert.deepEqual(units(epic), [], 'an epic without sub-issue data is never staged');
});

test('a stage run whose epic afkPlan would serve again is unrecorded, under the same identity, wait and re-queue rules', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const done = { ...epic, lastEditedAt: '2026-10-01T00:00:00Z', subIssuesSummary: { total: 2, completed: 2 } };
  const by = (id, body, login = 'builder') => ({ id, user: { login }, created_at: `2026-10-02T00:00:${String(id).padStart(2, '0')}Z`, body });
  const hold = by(10, '<!-- afk-epic-released session=run-1 -->');
  const unrecorded = (comments, target = done) => afkStageUnrecorded({ ...cfg, implementer: 'builder' }, target, comments, 'close', '2/2', now);
  const stages = (comments, target = done) => afkPlan({ ...cfg, implementer: 'builder' }, [], () => comments, 'new-run', { issues: [target], prs: [], now }).epics[0].units.map(unit => unit.stage);
  const verdict = by(11, '<!-- epic-check stage=close slices=2/2 verdict=owner -->');
  const cases = [
    [[hold], true, 'no verdict'],
    [[hold, verdict], false, 'a verdict'],
    [[hold, by(11, verdict.body, 'reviewer')], false, 'the Reviewer records a verdict too'],
    [[hold, by(11, verdict.body, 'stranger')], true, 'an untrusted verdict does not count'],
    [[hold, verdict, by(12, 'Evidence is in #12.')], true, 'a later comment re-queues the verdict'],
    [[hold, by(11, '<!-- epic-check stage=close verdict=owner -->')], true, 'a verdict without the count does not count'],
    [[hold, by(11, '<!-- epic-check stage=close slices=1/2 verdict=owner -->')], true, 'a wrong count does not count'],
    [[hold, by(11, '<!-- epic-check stage=close slices=2/20 verdict=owner -->')], true, 'a longer count does not count'],
    [[hold, by(11, '<!-- epic-check stage=slice slices=2/2 verdict=owner -->')], true, 'another stage does not count'],
    [[hold, by(12, '<!-- afk-wait until=2026-11-02T16:00:00Z cause=test deployment -->')], false, 'a wait'],
    [[hold, by(12, '<!-- afk-wait until=2026-11-02T16:00:00Z cause=test deployment -->', 'owner')], false, 'the owner may set a wait'],
    [[hold, by(12, '<!-- afk-wait until=2026-11-02T16:00:00Z cause=test deployment -->', 'stranger')], true, 'an untrusted wait does not count'],
    [[hold, by(12, '<!-- afk-wait until=tomorrow cause=test deployment -->')], true, 'a malformed wait does not count'],
    [[hold, by(12, '<!-- afk-wait until=2026-11-02T10:00:00Z cause=test deployment -->')], true, 'an expired wait does not count'],
  ];
  for (const [comments, expected, why] of cases) {
    assert.equal(unrecorded(comments), expected, why);
    assert.deepEqual(stages(comments), expected ? ['close'] : [], `afkPlan agrees: ${why}`);
  }
  const edited = { ...done, lastEditedAt: '2026-10-03T00:00:00Z' };
  assert.equal(unrecorded([hold, verdict], edited), true, 'an edit after the verdict re-queues it');
  assert.deepEqual(stages([hold, verdict], edited), ['close']);
});

test('a stage run gets its fallback marker only while the epic is still in the held stage', () => {
  const at = (total, completed) => ({ lastEditedAt: '2026-10-01T00:00:00Z', subIssuesSummary: { total, completed } });
  const fallback = (stage, target, comments = []) => afkStageFallback({ ...cfg, implementer: 'builder' }, { stage, comment: 10 }, target, comments, 'run-1', 0);
  assert.equal(fallback('slice', at(0, 0)), afkStageMarker('slice', '0/0', 'run-1'));
  assert.equal(fallback('slice', at(3, 0)), null, 'a slicing run that created sub-issues left the slice stage');
  assert.equal(fallback('close', at(2, 2)), afkStageMarker('close', '2/2', 'run-1'));
  assert.equal(fallback('close', at(3, 2)), null, 'a delivery check that added a slice left the close stage');
  assert.equal(fallback('slice', {}), null, 'a missing summary is no count');
  assert.equal(fallback('slice', at(0, 0), [{ id: 11, user: { login: 'builder' }, created_at: '2026-10-02T00:00:00Z', body: afkStageMarker('slice', '0/0', 'run-0') }]), null, 'a recorded verdict needs no fallback');
});

test('a stage run posts no fallback marker for an epic afkPlan skips for a lane, an open PR or another run\'s hold', () => {
  const done = { ...epic, lastEditedAt: '2026-10-01T00:00:00Z', subIssuesSummary: { total: 2, completed: 2 } };
  const hold = run => ({ id: 10, user: { login: 'builder' }, created_at: '2026-10-02T00:00:00Z', body: `<!-- afk-epic-hold session=${run} -->` });
  const pr = { number: 50, title: 'Deliver', body: 'Part of #1', closingIssuesReferences: [], headRefOid: 'abc', labels: [], statusCheckRollup: [], reviews: [], files: [] };
  const cases = [
    [done, [], [], true, 'nothing to skip'],
    [{ ...done, labels: ['type:epic', 'lane:owner'] }, [], [], false, 'a lane label'],
    [done, [pr], [], false, 'an issue already in a PR'],
    [done, [], [hold('run-2')], false, 'another live run holds the epic'],
    [done, [], [hold('run-1')], true, 'the ending run\'s own hold'],
  ];
  for (const [target, prs, comments, expected, why] of cases) {
    const plan = afkPlan({ ...cfg, implementer: 'builder' }, ['run-1', 'run-2'], () => comments, 'run-1', { issues: [target], prs, now: 0 });
    const inPr = new Set(plan.prs.flatMap(record => record.issues));
    const marker = afkStageFallback({ ...cfg, implementer: 'builder' }, { number: 1, stage: 'close', comment: 10 }, target, comments, 'run-1', 0, inPr, ['run-1', 'run-2']);
    assert.equal(marker !== null, expected, why);
    assert.deepEqual(plan.epics[0].units.filter(unit => unit.stage).map(unit => unit.stage), expected ? ['close'] : [], `afkPlan agrees: ${why}`);
  }
});

test('a stage run that ended without a matching verdict gets the exact fallback marker, which then holds the epic', () => {
  assert.equal(afkSlices({ completed: 2, total: 3 }), '2/3');
  assert.equal(afkSlices(undefined), null, 'a missing summary is no count');
  assert.equal(afkStageMarker('close', '2/2', 'run-1'), '<!-- epic-check stage=close slices=2/2 verdict=none session=run-1 -->\nRun run-1 ended without a verdict; this epic waits for an edit or a new comment.');
  const agent = { id: 11, user: { login: 'builder' }, created_at: '2026-10-02T00:00:00Z', body: '<!-- epic-check stage=close slices=1/2 verdict=owner -->' };
  const done = { ...epic, lastEditedAt: '2026-10-01T00:00:00Z', subIssuesSummary: { total: 2, completed: 2 } };
  const stages = comments => afkPlan({ ...cfg, implementer: 'builder' }, [], () => comments, 'new-run', { issues: [done], prs: [] }).epics[0].units.map(unit => unit.stage);
  assert.deepEqual(stages([agent]), ['close'], 'the wrong-count marker does not hold the epic');
  assert.equal(afkStageUnrecorded({ ...cfg, implementer: 'builder' }, done, [agent], 'close', afkSlices(done.subIssuesSummary)), true);
  const fallback = { id: 12, user: { login: 'builder' }, created_at: '2026-10-02T00:01:00Z', body: afkStageMarker('close', afkSlices(done.subIssuesSummary), 'run-1') };
  assert.deepEqual(stages([agent, fallback]), [], 'the fallback marker holds the epic');
});

test('an epic-check verdict holds only its own stage and sub-issue count, so a sliced epic is served for close later', () => {
  const at = (completed, total) => ({ ...epic, lastEditedAt: '2026-10-01T00:00:00Z', subIssuesSummary: { total, completed } });
  const verdict = (stage, slices) => ({ user: { login: 'builder' }, created_at: '2026-10-02T00:00:00Z', body: `<!-- epic-check stage=${stage} slices=${slices} verdict=none session=run-1 -->` });
  const stages = (target, comments) => afkPlan({ ...cfg, implementer: 'builder' }, [], () => comments, 'new-run', { issues: [target], prs: [] }).epics[0].units.map(unit => unit.stage);
  assert.deepEqual(stages(at(3, 3), [verdict('slice', '0/0')]), ['close'], 'slicing then closing every slice serves the close check');
  assert.deepEqual(stages(at(3, 3), [verdict('close', '2/2')]), ['close'], 'a slice added by the close check and then closed serves it again');
  assert.deepEqual(stages(at(3, 3), [verdict('close', '3/3')]), [], 'an unchanged count stays held');
  assert.deepEqual(stages({ ...at(3, 3), labels: ['type:epic', 'lane:owner'] }, []), [], 'an epic waiting on the owner is never staged');
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
  const [unit] = plan(taken).epics[0].units;
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
  const [again] = [...afkCandidates(plan(foreign).epics, afkOtherHolds(ledger, [], 'new-run'), true, () => false)];
  assert.deepEqual({ number: again.number, head: again.unit.head }, { number: 9, head: foreign }, 'the released PR is served at its new head');
});

test('a stop under a minute is reported in seconds, never as 0 minutes', () => {
  assert.equal(afkDuration(300), '1 second');
  assert.equal(afkDuration(59_000), '59 seconds');
  assert.equal(afkDuration(60_000), '1 minute');
  assert.equal(afkDuration(30 * 60_000), '30 minutes');
});

test('a run past afk.maxRunMinutes is stopped so its hold is released', () => {
  assert.equal(workflowDefaults.afk.maxRunMinutes, 30);
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
