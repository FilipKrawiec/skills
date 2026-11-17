import { addCriterionIds, verifyEpicClosure } from '../../plugins/common/workflow/scripts/lib/epic-closure.mjs';
import { pluginVersion } from '../../plugins/common/workflow/scripts/lib/plugin.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, nativeRemote, run } from './support/workflow-cli-fixture.mjs';
import {
  acquireRunLock, driveSessionId, assessmentComment, checkCommand, chooseSlot, checkSlots, decideEpic, decideIssue, dependencyOrder, drive, driveNext, nextTargets, holdBaseUpdates, latestAssessment,
  driveCommand, liveRuns, mergeCommitMessage, maxRuns, mergeBaseIntoHead, isManifestPath, waitSlotCommand, githubIo, findOverlaps, consolidationReport, distinctMarker, modelFor, modelForStep, sessionFor, driveSession, driveSessionCommand, deliveryAssignment, nextTarget, parseHandBack, updatePrBody, pickSlice, plannerBrief, implementerBrief, reviewerBrief, reviewerCommand,
} from '../../plugins/common/workflow/scripts/lib/drive.mjs';
import { dependenciesFromIssueBody } from '../../plugins/common/workflow/scripts/lib/board.mjs';
import { findCycle, readDependencies, splitDependencies } from '../../plugins/common/workflow/scripts/lib/dependencies.mjs';

const head = 'a'.repeat(40);
const lanes = { repo: 'acme/app', base: 'main', implementer: 'builder', reviewer: 'reviewer', owner: 'owner', steps: { test: ['just', 'verify'] } };
const label = name => ({ name });
const review = (verdict, state = 'COMMENTED') => ({ author: { login: 'reviewer' }, state, body: `<!-- agent-review sha=${head} round=1 verdict=${verdict} -->`, commit: { oid: head } });
const green = [{ name: 'verify', conclusion: 'SUCCESS' }];
const issue = (extra = {}) => ({ number: 3, url: 'https://github.com/acme/app/issues/3', state: 'OPEN', title: 'feat(app): add a thing', body: '', labels: [], ...extra });
const assessed = (risk = 'R1', paths = []) => ({ risk, assessed: risk, head, paths, reason: 'a local change' });
const pr = (extra = {}) => ({ assessment: assessed(), number: 5, url: 'https://github.com/acme/app/pull/5', state: 'OPEN', isDraft: true, headRefOid: head, headRefName: '3-add-a-thing', labels: [label('risk:R1')], mergeable: 'MERGEABLE', statusCheckRollup: green, reviews: [], body: 'Closes #3', closingIssuesReferences: [{ number: 3, repository: { owner: { login: 'acme' }, name: 'app' } }], files: [], ...extra });
const tree = (extra = {}) => ({ path: '/repo/.worktrees/3-add-a-thing', branch: '3-add-a-thing', dirty: false, commits: 0, unpushed: false, diffPaths: [], subjects: [], ...extra });
const started = issue({ labels: [label('state:started'), label('risk:R1')], assessment: assessed() });
const decide = facts => decideIssue({ blockers: [], diffPaths: [], handBack: {}, issueAssessment: facts.issue?.assessment, prAssessment: facts.pr?.assessment, ...facts }, lanes);

test('an unstarted issue starts once assessed, and a blocked one reports its blockers', () => {
  assert.deepEqual(decide({ issue: issue({ assessment: assessed() }) }), { do: 'start' });
  assert.deepEqual(decide({ issue: issue(), blockers: [2] }), { blocked: { issue: 3, by: [2] } });
  assert.deepEqual(decide({ issue: started }), { do: 'start' }, 'a claimed issue without its worktree makes it again');
});

test('build: the implementer runs until it hands back done, then drive commits, pushes and opens', () => {
  assert.equal(decide({ issue: started, tree: tree() }).agent, 'implementer');
  assert.equal(decide({ issue: started, tree: tree({ commits: 1, unpushed: true }) }).agent, 'implementer', 'no hand-back: same instruction');
  const done = { status: 'done', commit: 'feat(app): add a thing', paths: ['a.js'] };
  assert.deepEqual(decide({ issue: started, tree: tree({ dirty: true }), handBack: done }), { do: 'commit' });
  assert.deepEqual(decide({ issue: started, tree: tree({ commits: 1, unpushed: true }), handBack: done }), { do: 'push' });
  assert.deepEqual(decide({ issue: started, tree: tree({ commits: 1 }), handBack: done }), { do: 'open' });
  assert.equal(decide({ issue: started, tree: tree({ dirty: true }), handBack: { status: 'done' } }).agent, 'implementer', 'nothing to commit with');
  assert.deepEqual(decide({ issue: started, tree: tree(), handBack: { status: 'replan', note: 'two seams' } }), { agent: 'planner', mode: 'replan', reason: 'two seams' });
  assert.deepEqual(decide({ issue: started, tree: tree(), handBack: { status: 'blocked', note: 'needs a key' } }), { owner: '#3: needs a key' });
});

test('review, fix, ready, merge and close follow the PR state', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  assert.deepEqual(decide({ ...base, pr: pr() }), { agent: 'reviewer', mode: 'review', reason: 'no verdict at the head', round: 1 });
  assert.deepEqual(decide({ ...base, pr: pr({ statusCheckRollup: [{ name: 'verify', status: 'QUEUED' }] }) }), { wait: { pr: 5, until: 'ci' } });
  assert.deepEqual(decide({ ...base, pr: pr({ labels: [label('risk:R1'), label('state:reviewing')] }) }), { wait: { pr: 5, until: 'reviewed' } });
  assert.deepEqual(decide({ ...base, pr: pr({ reviews: [review('fixes')] }) }), { agent: 'implementer', mode: 'fix', reason: 'blocking review findings', resume: true });
  assert.deepEqual(decide({ ...base, tree: tree({ dirty: true }), pr: pr({ reviews: [review('fixes')] }), handBack: { status: 'done', commit: 'fix(app): x', paths: ['a'] } }), { do: 'commit' });
  assert.deepEqual(decide({ ...base, pr: pr({ reviews: [review('ready')] }) }), { do: 'ready' });
  assert.deepEqual(decide({ ...base, pr: pr({ isDraft: false, reviews: [review('ready')] }) }), { do: 'approve', round: 1 });
  assert.deepEqual(decide({ ...base, pr: pr({ isDraft: false, reviews: [review('ready', 'APPROVED')] }) }), { do: 'auto-merge' });
  assert.deepEqual(decide({ ...base, pr: pr({ isDraft: false, reviews: [review('ready', 'APPROVED')], autoMergeRequest: { enabledAt: 'x' } }) }), { wait: { pr: 5, until: 'merged' } });
  assert.deepEqual(decide({ ...base, pr: pr({ state: 'MERGED' }) }), { do: 'close' });
  assert.deepEqual(decide({ issue: issue({ state: 'CLOSED' }), tree: tree() }), { do: 'remove-worktree' });
  assert.deepEqual(decide({ issue: issue({ state: 'CLOSED' }) }), { done: { issue: 3 } });
});

test('an old claim with unknown liveness remains held', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const claimed = pr({ labels: [label('risk:R1'), label('state:reviewing')] });
  const since = Date.parse('2026-11-11T10:00:00Z'); const hour = 60 * 60_000;
  assert.deepEqual(decide({ ...base, pr: claimed, reviewingSince: since, now: since + hour - 1 }), { wait: { pr: 5, until: 'reviewed' } });
  assert.deepEqual(decide({ ...base, pr: claimed, reviewingSince: since, now: since + hour }), { wait: { pr: 5, until: 'reviewed' } });
});

test('an approved PR behind its base under review:owner is updated from the base, never sent to the owner', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const held = pr({ isDraft: false, mergeStateStatus: 'BEHIND', labels: [label('risk:R1'), label('review:owner')], reviews: [review('owner', 'APPROVED')] });
  assert.deepEqual(decide({ ...base, pr: held }), { do: 'update-branch' });
  assert.equal(decide({ ...base, pr: { ...held, mergeStateStatus: 'BLOCKED' } }).owner, 'review:owner', 'up to date, it is the owner\'s');
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [{ ...held, issue: 3 }] });
  const step = drive(repo.io, 3, lanes, {});
  assert.deepEqual(repo.calls, [['update-branch', 5]]);
  assert.deepEqual(step.wait, { pr: 5, until: 'ci' }, 'the new head needs CI, then a fresh approval');
  repo.s.prs[0].statusCheckRollup = green;
  const again = drive(repo.io, 3, lanes, {});
  assert.deepEqual([again.agent, again.mode], ['reviewer', 'review'], 'the Reviewer judges the new head before the owner sees it');
  assert.deepEqual(repo.s.synced, ['/repo/.worktrees/3-add-a-thing'], 'the worktree takes the merged head before the Reviewer works in it');
});

test('behind PRs of an epic bring the base in one at a time, oldest first', () => {
  const entry = (number, prNumber, step, extra = {}) => ({ number, pr: pr({ number: prNumber, isDraft: false, ...extra }), step });
  const update = { do: 'update-branch' };
  const held = holdBaseUpdates([entry(11, 62, update), entry(10, 61, update)]);
  assert.deepEqual(held.map(e => e.step), [{ blocked: { issue: 11, reason: 'brings the base in after PR #61 is updated' } }, update]);
  const busy = holdBaseUpdates([entry(10, 61, { wait: { pr: 61, until: 'ci' } }), entry(11, 62, update)]);
  assert.deepEqual(busy[1].step, { blocked: { issue: 11, reason: 'brings the base in after PR #61 merges' } });
  const idle = [entry(10, 61, { agent: 'implementer' }), entry(11, 62, update)];
  assert.deepEqual(holdBaseUpdates(idle)[1].step, update, 'a PR being fixed does not hold the update');
});

test('strict policy: of two approved PRs, the second is updated and approved again after the first merges, then merges', () => {
  const epic = issue({ number: 9, title: 'epic', labels: [label('type:epic')] });
  const slice = n => issue({ number: n, labels: [label('risk:R1')] });
  const approvedAt = oid => ({ author: { login: 'reviewer' }, state: 'APPROVED', body: `<!-- agent-review sha=${oid} round=1 verdict=ready -->`, commit: { oid } });
  const ready = (n, number) => pr({ issue: n, number, isDraft: false, mergeStateStatus: 'BEHIND', reviews: [approvedAt(head)], autoMergeRequest: {}, body: `Closes #${n}`, closingIssuesReferences: [] });
  const repo = fakeRepo({ issues: { 9: epic, 10: slice(10), 11: slice(11) }, subs: { 9: [10, 11] }, trees: { 10: tree({ path: '/w/10', commits: 1 }), 11: tree({ path: '/w/11', commits: 1 }) }, prs: [ready(10, 61), ready(11, 62)] });
  repo.io.pr = n => repo.s.prs.find(p => p.issue === n) || null;
  const [first, second] = repo.s.prs;
  // Strict: a merge into the base sends every other open PR behind it.
  const merge = p => { p.state = 'MERGED'; repo.s.merged = [...(repo.s.merged || []), p.issue]; for (const other of repo.s.prs) if (other !== p && other.state === 'OPEN') other.mergeStateStatus = 'BEHIND'; };
  const approve = p => { p.statusCheckRollup = green; p.reviews.push(approvedAt(p.headRefOid)); };
  assert.deepEqual(drive(repo.io, 9, lanes, {}).wait, { pr: 61, until: 'ci' });
  assert.deepEqual(repo.calls.filter(c => ['disable-auto-merge', 'update-branch'].includes(c[0])), [['disable-auto-merge', 61], ['update-branch', 61]], 'disable before updating');
  assert.deepEqual(drive(repo.io, 9, lanes, {}).wait, { pr: 61, until: 'ci' }, 'held while the first is on its way');
  first.statusCheckRollup = green;
  assert.equal(drive(repo.io, 9, lanes, {}).agent, 'reviewer');
  approve(first);
  assert.deepEqual(drive(repo.io, 9, lanes, {}).wait, { pr: 61, until: 'merged' });
  assert.equal(repo.calls.filter(c => c[0] === 'update-branch').length, 1, 'the second is not updated before the first merges');
  merge(first);
  assert.deepEqual(drive(repo.io, 9, lanes, {}).done, { issue: 10 });
  assert.deepEqual(drive(repo.io, 9, lanes, {}).wait, { pr: 62, until: 'ci' });
  assert.deepEqual(repo.calls.filter(c => c[0] === 'update-branch'), [['update-branch', 61], ['update-branch', 62]]);
  second.statusCheckRollup = green;
  assert.equal(drive(repo.io, 9, lanes, {}).agent, 'reviewer', 'a fresh approval at the updated head');
  approve(second);
  assert.deepEqual(drive(repo.io, 9, lanes, {}).wait, { pr: 62, until: 'merged' });
  merge(second);
  drive(repo.io, 9, lanes, {});
  assert.equal(repo.s.issues[11].state, 'CLOSED');
});

test('the owner is asked only on an approved PR; the round cap and line count never ask', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const approved = [review('ready', 'APPROVED')];
  assert.equal(decide({ ...base, pr: pr({ isDraft: false, labels: [label('risk:R2')], reviews: approved }) }).do, 'auto-merge', 'risk R2 alone never asks the owner');
  assert.equal(decide({ ...base, pr: pr({ isDraft: false, labels: [label('risk:R1'), label('review:owner')], reviews: [review('owner', 'APPROVED')] }) }).owner, 'review:owner', 'a reserved effect does');
  assert.equal(decide({ ...base, pr: pr({ labels: [label('risk:R2')], reviews: [review('ready')] }) }).do, 'ready', 'an R2 draft goes to its approval first');
  assert.equal(decide({ ...base, pr: pr({ reviews: [review('fixes'), review('fixes'), review('fixes')] }) }).owner, undefined);
  const huge = Array.from({ length: 5000 }, (_, i) => `src/file${i}.js`);
  assert.equal(decide({ ...base, diffPaths: huge, pr: pr({ isDraft: false, reviews: approved, assessment: assessed('R1', huge) }) }).do, 'auto-merge');
});

test('an approved owner-held draft becomes ready before owner approval and merge', () => {
  const held = pr({ issue: 3, labels: [label('risk:R2'), label('review:owner')], reviews: [review('owner', 'APPROVED')], assessment: assessed('R2') });
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [held] });
  const owner = drive(repo.io, 3, lanes, {});
  assert.equal(repo.s.prs[0].isDraft, false);
  assert.equal(owner.owner, 'review:owner');
  assert.deepEqual(repo.calls.filter(call => call[0] === 'ready' || call[0] === 'auto-merge'), [['ready']]);
  repo.s.prs[0].reviews.push({ author: { login: 'owner' }, state: 'APPROVED', commit: { oid: head }, body: '' });
  assert.deepEqual(drive(repo.io, 3, lanes, {}).wait, { pr: 5, until: 'merged' });
  assert.deepEqual(repo.calls.filter(call => call[0] === 'auto-merge'), [['auto-merge']]);
});

test('from the third blocking verdict a fresh implementer on the strongest model fixes the whole open set', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  assert.equal(decide({ ...base, pr: pr({ reviews: [review('fixes'), review('fixes')] }) }).resume, true);
  const third = decide({ ...base, pr: pr({ reviews: [review('fixes'), review('fixes'), review('fixes')] }) });
  assert.deepEqual([third.agent, third.mode, third.fresh, third.resume], ['implementer', 'fix', true, undefined]);
  assert.equal(modelForStep(third, 'R0'), 'opus');
  assert.equal(modelForStep({ agent: 'implementer', resume: true }, 'R0'), 'sonnet');
});

test('the fresh fix round runs once: a blocking verdict after it cuts scope through the planner, never the owner', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const fourth = decide({ ...base, pr: pr({ reviews: [review('fixes'), review('fixes'), review('fixes'), review('fixes')] }) });
  assert.deepEqual([fourth.agent, fourth.mode, fourth.owner], ['planner', 'replan', undefined]);
  assert.match(fourth.reason, /narrow the issue to what the PR delivers/);
});

test('a cut after the fresh round keeps the PR: the planner narrows its issue and the Reviewer judges the same head again', () => {
  const blocked = [review('fixes'), review('fixes'), review('fixes'), review('fixes')];
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, reviews: blocked })] });
  const replan = drive(repo.io, 3, lanes, {});
  assert.deepEqual([replan.agent, replan.mode], ['planner', 'replan']);
  const brief = repo.writes[replan.brief];
  assert.match(brief, /narrow this issue's criteria to what PR #5 delivers/);
  assert.match(brief, /Never close the PR/);
  // The planner narrows the issue and files the rest; the PR, its head and its verdicts stay.
  const next = drive(repo.io, 3, lanes, { status: 'narrowed', slices: '4' });
  assert.deepEqual(repo.calls, [], 'no new build, commit or push');
  assert.deepEqual([next.agent, next.mode, next.pr], ['reviewer', 'review', 5]);
  assert.equal(next.command.includes('review-5-r5'), true);
  assert.match(repo.writes[next.brief], new RegExp(`at head ${head}`));
  assert.match(repo.writes[next.brief], /Narrowed scope, same head/);
  // A ready verdict at that head then readies the PR, which merges closing the narrowed issue.
  repo.s.prs[0].reviews.push(review('ready'));
  assert.deepEqual(drive(repo.io, 3, lanes, {}).agent, 'reviewer');
  assert.deepEqual(repo.calls, [['ready'], ['unclaim', 3]]);
  // Without a PR, a cut splits the issue into an epic; a `sliced` hand-back on a story reports blocked, not another planner round.
  assert.match(plannerBrief({ issue: started, pr: null, step: { mode: 'replan', reason: 'two seams' } }), /sibling story or bug under the same epic/);
  assert.deepEqual(decide({ issue: started, tree: tree({ commits: 1 }), pr: pr({ reviews: blocked }), handBack: { status: 'sliced' } }), { blocked: { issue: 3, reason: 'the planner handed back sliced, yet the issue is not an epic' } });
});

test('a PR found through its issue but linking none is linked by drive, never sent to the owner', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  assert.deepEqual(decide({ ...base, pr: pr({ body: 'Stacked work', closingIssuesReferences: [] }) }), { do: 'link-issue' });
  assert.equal(decide({ ...base, pr: pr({ body: 'Closes #3', closingIssuesReferences: [] }) }).agent, 'reviewer', 'a stacked PR closing its issue in the body goes to review');
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, body: 'Stacked work', closingIssuesReferences: [] })] });
  const step = drive(repo.io, 3, lanes, {});
  assert.deepEqual(repo.calls, [['link-issue', 5, 3]]);
  assert.deepEqual([step.agent, step.mode], ['reviewer', 'review']);
});

test('risk: assess the draft rather than launching before build', () => {
  const fresh = issue();
  assert.deepEqual(decide({ issue: fresh }), { do: 'start' });
  const base = { issue: started, tree: tree({ commits: 1 }) };
  assert.deepEqual(decide({ ...base, diffPaths: ['src/a.js'], pr: pr({ assessment: null }) }), { agent: 'devops', mode: 'risk', task: 'risk', reason: 'assess the diff of the draft' });
  assert.deepEqual(decide({ ...base, diffPaths: ['src/a.js'], pr: pr({ assessment: null }), handBack: { risk: 'R2', reason: 'weakens a gate' } }), { do: 'assess', risk: 'R2', reason: 'weakens a gate' });
  assert.equal(decide({ ...base, diffPaths: ['src/a.js'], pr: pr({ assessment: assessed('R1', ['src/a.js']) }) }).agent, 'reviewer', 'an assessed diff goes to review');
  assert.deepEqual(decide({ ...base, diffPaths: ['src/a.js'], pr: pr({ assessment: assessed('R1', ['src/a.js']), labels: [label('state:reviewing')] }) }), { wait: { pr: 5, until: 'reviewed' } });
  assert.deepEqual([modelFor('R0'), modelFor('R1'), modelFor('R2')], ['sonnet', 'sonnet', 'opus']);
  assert.equal(modelForStep({ agent: 'devops', fresh: true }, 'R2'), 'sonnet', 'the assessor runs on Sonnet');
});

test('risk: a fix-round head is reassessed only when it touches files the last assessment did not see', () => {
  const base = { issue: started, tree: tree({ commits: 2 }) };
  const last = assessed('R1', ['src/a.js', 'test/a.test.js']);
  const moved = { headRefOid: 'b'.repeat(40), assessment: last, reviews: [review('fixes')] };
  assert.equal(decide({ ...base, diffPaths: ['src/a.js'], pr: pr(moved) }).agent, 'reviewer', 'a head touching only seen files keeps the last assessment');
  const again = decide({ ...base, diffPaths: ['src/a.js', 'src/b.js'], pr: pr(moved) });
  assert.deepEqual([again.agent, again.task], ['devops', 'risk']);
  assert.match(again.reason, /1 file the last assessment did not see: src\/b\.js/);
});

test('risk: an owner-set issue label is a floor the PR label never goes below', () => {
  const base = { issue: issue({ labels: [label('state:started'), label('risk:R2')], assessment: assessed('R2') }), tree: tree({ commits: 1 }) };
  assert.deepEqual(decide({ ...base, pr: pr({ labels: [label('risk:R1')] }) }), { do: 'risk', risk: 'R2' }, 'raised to the floor');
  assert.equal(decide({ ...base, pr: pr({ labels: [label('risk:R2')], assessment: assessed('R2') }) }).agent, 'reviewer');
  assert.equal(decide({ issue: started, tree: tree({ commits: 1 }), pr: pr({ labels: [label('risk:R2')] }) }).agent, 'reviewer', 'a raised PR label is never lowered by drive');
});

test('risk: an assessment comment carries its risk, head and the files it saw, and only drive\'s count', () => {
  const record = { risk: 'R2', assessed: 'R1', floor: 'R2', head, paths: ['src/a.js'], reason: 'changes one parser' };
  const body = assessmentComment(record);
  assert.match(body, /Risk R2/);
  assert.match(body, /changes one parser/);
  assert.match(body, /floor/);
  const comments = [{ user: { login: 'builder' }, body: assessmentComment({ ...record, risk: 'R1', floor: null }) }, { user: { login: 'builder' }, body }, { user: { login: 'mallory' }, body: assessmentComment({ ...record, risk: 'R0' }) }];
  assert.deepEqual(latestAssessment(comments, 'builder'), record);
  assert.equal(latestAssessment([{ user: { login: 'builder' }, body: 'plain' }], 'builder'), null);
});

test('drive: one diff assessment and one reviewer session deliver a clean PR', () => {
  const repo = fakeRepo({ issues: { 3: issue() } });
  const launches = [];
  const build = drive(repo.io, 3, lanes, {}); launches.push(build.agent);
  assert.deepEqual([build.agent, build.model], ['implementer', 'sonnet']);
  repo.s.trees[3].dirty = true;
  const risk = drive(repo.io, 3, lanes, { status: 'done', commit: 'docs(a): b', paths: ['docs/a.md'] }); launches.push(risk.agent);
  assert.deepEqual([risk.agent, risk.task], ['devops', 'risk']);
  assert.match(repo.writes[risk.brief], /gh pr diff 53/);
  const reviewer = drive(repo.io, 3, lanes, { risk: 'R0', reason: 'text only' }); launches.push(reviewer.agent);
  assert.equal(reviewer.session, 'separate');
  repo.s.prs[0].reviews = [review('ready', 'APPROVED')];
  const wait = drive(repo.io, 3, lanes, {});
  assert.deepEqual(launches, ['implementer', 'devops', 'reviewer']);
  assert.deepEqual(wait.wait, { pr: 53, until: 'merged' });
  assert.equal(repo.s.comments.length, 1);
});

test('drive: an owner floor wins over a lower assessment', () => {
  const repo = fakeRepo({ issues: { 3: issue({ labels: [label('risk:R2')] }) }, trees: {} });
  drive(repo.io, 3, lanes, {});
  const build = drive(repo.io, 3, lanes, { risk: 'R0', reason: 'text only' });
  assert.equal(build.model, 'opus');
  assert.deepEqual(repo.calls[0], ['start', 3]);
  assert.deepEqual(repo.s.issues[3].labels.map(l => l.name), ['risk:R2', 'state:started'], 'drive never rewrites the issue label');
});

test('hand-backs are at most 6 lines of key: value', () => {
  assert.deepEqual(parseHandBack('status: done\ncommit: feat(a): b\npaths: a.js b.js\ncheck: pass\nnote: ok\nbody: evidence.md\nextra: dropped'), { status: 'done', commit: 'feat(a): b', paths: ['a.js', 'b.js'], check: 'pass', note: 'ok', body: 'evidence.md' });
  assert.equal(parseHandBack('DONE all good').status, 'done');
});

test('epics: slice when empty, deliver slices in dependency order, close when all are closed', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  assert.deepEqual(decideEpic({ epic, slices: [] }), { agent: 'planner', mode: 'slice', reason: 'the epic has no slices' });
  assert.ok(decideEpic({ epic: { ...epic, labels: [label('type:epic'), label('lane:owner')] }, slices: [] }).owner);
  const slices = [{ number: 12, state: 'OPEN', blockers: [11] }, { number: 11, state: 'OPEN', blockers: [10] }, { number: 10, state: 'OPEN', blockers: [] }, { number: 13, state: 'OPEN', blockers: [] }, { number: 8, state: 'CLOSED', blockers: [] }];
  assert.deepEqual(dependencyOrder(slices).map(s => s.number), [10, 11, 12, 13]);
  assert.deepEqual(decideEpic({ epic, slices }), { slices: [10, 13] });
  assert.deepEqual(decideEpic({ epic, slices: [{ number: 8, state: 'CLOSED', blockers: [] }] }), { do: 'close-epic' });
  assert.ok(decideEpic({ epic, slices: [{ number: 10, state: 'OPEN', blockers: [99] }] }).owner);
  assert.equal(pickSlice([{ number: 10, step: { wait: { pr: 1 } } }, { number: 13, step: { agent: 'implementer' } }]).number, 13);
});

// An in-memory repository: each mechanical step changes state the way GitHub and Git would.
function fakeRepo(initial) {
  const s = structuredClone(initial); const calls = []; const writes = {};
  const io = {
    // A blocked-by link to a closed issue counts as met, like a completed issue whose closing PR merged.
    issue: n => s.issues[n], dependencies: i => [...(s.blockers?.[i.number] || []).map(m => ({ number: m, kind: 'issue', state: s.issues[m]?.state || 'OPEN', reason: 'completed', merged: true })), ...(s.deps?.[i.number] || [])], subIssues: n => (s.subs?.[n] || []).map(m => ({ number: m, state: s.issues[m].state })),
    allBlockers: n => s.blockers?.[n] || [],
    addBlocker: (n, blocker) => { calls.push(['blocker', n, blocker]); ((s.blockers ||= {})[n] ||= []).push(blocker); },
    mergedClosingPr: n => (s.merged || []).includes(n),
    hasLessons: n => (s.lessons || []).includes(n),
    verifyEpic: () => ({ complete: true, issues: [] }),
    createRefinement: epic => { const n = 99; calls.push(['create-refinement', n]); const item = issue({ number: n, title: 'refinement', body: '<!-- workflow:epic-refinement -->' }); s.issues[n] = item; s.subs[epic.number].push(n); return item; },
    pr: n => (s.prs || []).find(p => p.issue === n && p.state === 'OPEN') || null, tree: n => s.trees?.[n] || null,
    assessment: (i, p) => (p ? p.assessment : i.assessment) || null,
    assess: (i, p, record) => { calls.push(['assess', i.number, p?.number ?? null, record.risk]); (s.comments ||= []).push({ on: p?.number ?? i.number, record }); if (p) { p.assessment = record; p.labels = [...p.labels.filter(l => !l.name.startsWith('risk:')), label(`risk:${record.risk}`)]; } else i.assessment = record; },
    openIssues: () => Object.values(s.issues).filter(i => i.state === 'OPEN'),
    start: i => { calls.push(['start', i.number]); i.labels = [...i.labels, label('state:started')]; (s.trees ||= {})[i.number] = tree({ path: `/w/${i.number}`, branch: `${i.number}-x` }); },
    commit: (t, message, paths) => { calls.push(['commit']); t.diffPaths = paths; t.dirty = false; t.commits++; t.unpushed = true; },
    push: t => { calls.push(['push']); t.unpushed = false; },
    open: (i, t, risk) => { calls.push(['open', i.number, risk]); (s.prs ||= []).push(pr({ issue: i.number, number: 50 + i.number, labels: [label(`risk:${risk}`)], assessment: null })); },
    updateBody: (p, t, hb) => { p.body = updatePrBody(p.body, hb, hb.body); },
    reviewingSince: () => null,
    linkIssue: (p, i) => { calls.push(['link-issue', p.number, i.number]); p.body = `Closes #${i.number}\n\n${p.body}`; },
    releaseReview: p => { calls.push(['release-review', p.number]); p.labels = p.labels.filter(l => l.name !== 'state:reviewing'); },
    risk: (p, from, to) => { calls.push(['risk', to]); p.labels = [label(`risk:${to}`)]; },
    ready: p => { calls.push(['ready']); p.isDraft = false; },
    unclaim: i => { calls.push(['unclaim', i.number]); i.labels = i.labels.filter(l => !l.name.startsWith('state:')); },
    strictPolicy: () => true,
    autoMerge: p => { calls.push(['auto-merge']); p.autoMergeRequest = {}; },
    // `gh pr update-branch`: a merge commit on the head, whose checks start again; the old approval no longer covers it.
    syncTree: t => { (s.synced ||= []).push(t.path); },
    disableAutoMerge: p => { calls.push(['disable-auto-merge', p.number]); p.autoMergeRequest = null; },
    updateBranch: p => { calls.push(['update-branch', p.number]); Object.assign(p, { headRefOid: `${p.number}`.padEnd(40, 'b'), mergeStateStatus: 'BLOCKED', statusCheckRollup: [{ name: 'verify', status: 'QUEUED' }] }); },
    close: i => { calls.push(['close', i.number]); i.state = 'CLOSED'; },
    closeEpic: e => { calls.push(['close-epic', e.number]); e.state = 'CLOSED'; },
    removeTree: t => { calls.push(['remove', t.path]); },
    scratch: t => `${t?.path || '/repo'}/.wf`,
    write: (path, text) => { writes[path] = text; },
    read: path => writes[path] ?? null,
    board: (n, value) => { (s.board ||= {})[n] = value; },
    requiredBoard: (n, value) => { (s.board ||= {})[n] = value; },
  };
  return { s, io, calls, writes };
}

test('drive pushes a real commit once and opens its PR in the same call', t => {
  const f = fixture(t);
  const remote = nativeRemote(f);
  writeFileSync(join(f.repo, 'change.txt'), 'change');
  assert.equal(f.linkedGit('add', 'change.txt').status, 0);
  assert.equal(f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'feat: change').status, 0);
  const repo = fakeRepo({ issues: { 3: started } });
  repo.io.tree = () => tree({ path: f.repo, branch: 'feature/test', commits: 1, unpushed: Boolean(f.linkedGit('log', '--oneline', 'HEAD', '--not', '--remotes').stdout.trim()) });
  let pushed = false;
  repo.io.push = () => {
    assert.equal(pushed, false, 'drive must make progress after the push');
    pushed = true;
    const result = f.cliRun('push');
    assert.equal(result.status, 0, result.stderr);
  };
  const result = drive(repo.io, 3, lanes, { status: 'done' });
  assert.equal(run(f.env.REAL_GIT, ['--git-dir', remote, 'rev-parse', 'refs/heads/feature/test']).stdout.trim(), f.linkedGit('rev-parse', 'HEAD').stdout.trim());
  assert.equal(repo.s.prs[0].issue, 3);
  assert.equal(result.agent, 'devops', 'the new draft is assessed before review');
});

test('drive performs the mechanical steps and stops at one instruction; re-running repeats it', () => {
  const repo = fakeRepo({ issues: { 3: issue({ body: '```scope\n{"paths":["docs/a.md"]}\n```', assessment: assessed('R0') }) } });
  const first = drive(repo.io, 3, lanes, {});
  assert.deepEqual(repo.calls, [['start', 3]]);
  assert.deepEqual({ ...first, brief: undefined }, { agent: 'implementer', host: 'claude', model: 'sonnet', plugin: pluginVersion(), brief: undefined, issue: 3, pr: null, session: 'subagent', mode: 'build', cwd: '/w/3', effort: 'medium' });
  assert.equal(first.brief, '/w/3/.wf/drive-3-implementer.md');
  assert.match(repo.writes[first.brief], /status: done \| replan \| blocked/);
  const brief = repo.writes[first.brief];
  assert.deepEqual(drive(repo.io, 3, lanes, {}), first, 'idempotent');
  assert.equal(repo.writes[first.brief], brief);
  assert.equal(repo.calls.length, 1);
  repo.s.trees[3].dirty = true;
  assert.equal(drive(repo.io, 3, lanes, { status: 'done', commit: 'docs(a): b', paths: ['docs/a.md'] }).agent, 'devops');
  assert.deepEqual(repo.calls.slice(1), [['commit'], ['push'], ['open', 3, 'R0']]);
  assert.equal(repo.s.board[3], 'PROGRESS', 'a draft PR keeps its issue In progress');
  const reviewer = drive(repo.io, 3, lanes, { risk: 'R0', reason: 'text only' });
  assert.equal(reviewer.agent, 'reviewer');
  assert.equal(reviewer.session, 'separate');
  assert.equal(reviewer.pr, 53);
  assert.deepEqual(reviewer.command.slice(4, 12), ['claude', '--print', '--output-format', 'json', '--agent', 'filipkrawiec-workflow:reviewer', '--model', 'opus'], 'the Reviewer runs Opus even at R0');
  assert.deepEqual(drive(repo.io, 3, lanes, { risk: 'R0', reason: 'text only' }), reviewer, 'a repeated hand-back changes nothing');
  repo.s.prs[0].reviews = [review('ready', 'APPROVED')];
  const wait = drive(repo.io, 3, lanes, {});
  assert.deepEqual(repo.calls.at(-1), ['auto-merge']);
  assert.deepEqual(wait.wait, { pr: 53, until: 'merged' });
  assert.deepEqual(wait.command.slice(2), ['wait', '53', '--until', 'merged']);
  repo.s.prs[0].state = 'MERGED';
  repo.s.issues[3].state = 'CLOSED';
  assert.deepEqual(drive(repo.io, 3, lanes, {}), { done: { issue: 3 } });
  assert.deepEqual(repo.calls.at(-1), ['remove', '/w/3']);
});

test('an R2 issue runs Opus for both roles and stops for the owner after approval', () => {
  const repo = fakeRepo({ issues: { 3: issue({ labels: [label('risk:R2')], assessment: assessed('R2') }) } });
  assert.equal(drive(repo.io, 3, lanes, {}).model, 'opus');
  repo.s.trees[3].dirty = true;
  drive(repo.io, 3, lanes, { status: 'done', commit: 'feat(a): b', paths: ['a'] });
  const reviewer = drive(repo.io, 3, lanes, { risk: 'R1', reason: 'one feature' });
  assert.equal(reviewer.model, 'opus');
  assert.ok(reviewer.command.includes('opus'));
  Object.assign(repo.s.prs[0], { isDraft: false, reviews: [review('owner', 'APPROVED')], labels: [label('risk:R2'), label('review:owner')] });
  assert.equal(drive(repo.io, 3, lanes, {}).owner, 'review:owner');
});

test('a closed issue still carrying a state label drops it before anything else', () => {
  const claimed = issue({ state: 'CLOSED', labels: [label('state:started'), label('risk:R1')] });
  assert.deepEqual(decide({ issue: claimed, tree: tree() }), { do: 'unclaim' });
  assert.deepEqual(decide({ issue: claimed }), { do: 'unclaim' });
  assert.deepEqual(decide({ issue: issue({ state: 'CLOSED', labels: [label('risk:R1')] }) }), { done: { issue: 3 } });
});

test('drive closes an issue after its PR merged and leaves it with no state label', () => {
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, state: 'MERGED' })] });
  repo.io.pr = n => repo.s.prs.find(p => p.issue === n) || null;
  assert.deepEqual(drive(repo.io, 3, lanes, {}), { done: { issue: 3 } });
  assert.deepEqual(repo.calls, [['close', 3], ['unclaim', 3], ['remove', '/repo/.worktrees/3-add-a-thing']]);
  assert.equal(repo.s.issues[3].state, 'CLOSED');
  assert.equal(repo.s.board[3], 'DONE');
  assert.deepEqual(repo.s.issues[3].labels.map(l => l.name), ['risk:R1']);
});

test('drive <epic> plans, drives the first ready slice, lists the others and closes the epic', () => {
  const epic = issue({ number: 9, title: 'epic', labels: [label('type:epic')] });
  const empty = fakeRepo({ issues: { 9: epic } });
  const planner = drive(empty.io, 9, lanes, {});
  assert.deepEqual([planner.agent, planner.model, planner.mode, planner.issue], ['planner', 'opus', 'slice', 9]);
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10 }), 11: issue({ number: 11 }), 12: issue({ number: 12 }) }, subs: { 9: [10, 11, 12] }, blockers: { 11: [10] } });
  const result = drive(repo.io, 9, lanes, {});
  assert.deepEqual([result.agent, result.issue, result.epic, result.alsoReady], ['implementer', 10, 9, [12]]);
  for (const n of [10, 11, 12, 99]) repo.s.issues[n].state = 'CLOSED';
  repo.s.merged = [10, 11, 12, 99];
  repo.s.blockers = {};
  assert.equal(drive(repo.io, 9, lanes, {}).agent, 'improver');
  repo.s.lessons = [9];
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
  assert.deepEqual(repo.calls.at(-1), ['close-epic', 9]);
});

test('--next prefers started issues, then approved epics and standalone issues by number', () => {
  assert.equal(nextTarget([{ number: 4, labels: [label('type:epic')] }, { number: 7, labels: [label('state:started')] }]), 7);
  assert.equal(nextTarget([{ number: 4, labels: [label('type:epic'), label('lane:owner')] }, { number: 6, labels: [label('type:epic')] }]), 6);
  assert.equal(nextTarget([{ number: 8, labels: [] }, { number: 5, labels: [label('type:epic')] }, { number: 2, labels: [label('lane:owner')] }]), 5);
  assert.equal(nextTarget([{ number: 2, labels: [label('lane:owner')] }]), null);
  assert.equal(nextTarget([]), null);
});

test('a clean round-1 review approves in its own session; drive readies and enables auto-merge with no approval-only session', () => {
  const approved = pr({ issue: 3, reviews: [review('ready', 'APPROVED')] });
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [approved] });
  const result = drive(repo.io, 3, lanes, {});
  assert.deepEqual(result.wait, { pr: 5, until: 'merged' });
  assert.equal(result.agent, undefined, 'no reviewer session of any kind');
  assert.deepEqual(repo.calls.filter(call => ['ready', 'auto-merge'].includes(call[0])), [['ready'], ['auto-merge']]);
});

test('a ready verdict at a green head is approved by drive as the Reviewer, then auto-merge follows with no agent', () => {
  const ready = pr({ issue: 3, isDraft: false, reviews: [review('ready')] });
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [ready] });
  repo.io.approve = (p, round) => { repo.calls.push(['approve', p.headRefOid, round]); p.reviews.push(review('ready', 'APPROVED')); };
  const result = drive(repo.io, 3, lanes, {});
  assert.deepEqual(result.wait, { pr: 5, until: 'merged' });
  assert.equal(result.agent, undefined);
  assert.deepEqual(repo.calls.filter(call => ['approve', 'auto-merge'].includes(call[0])), [['approve', head, 1], ['auto-merge']], 'pr auto-merge accepts the posted approval');
});

test('when drive cannot post the approval, the Reviewer is launched for it', () => {
  const ready = pr({ issue: 3, isDraft: false, reviews: [review('ready')] });
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [ready] });
  repo.io.approve = () => { throw new Error('GitHub did not confirm the approval'); };
  assert.equal(drive(repo.io, 3, lanes, {}).mode, 'approve');
});

test('an approval-only session runs only when a ready verdict at the head lacks its approval; a moved head is reviewed afresh', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const unapproved = { isDraft: false, reviews: [review('ready')] };
  assert.equal(decide({ ...base, pr: pr({ ...unapproved, statusCheckRollup: [{ name: 'verify', status: 'QUEUED' }] }) }).do, undefined, 'pending CI never approves');
  assert.equal(decide({ ...base, pr: pr({ ...unapproved, statusCheckRollup: [{ name: 'verify', conclusion: 'FAILURE' }] }) }).agent, 'implementer', 'red CI never approves');
  assert.equal(decide({ ...base, pr: pr({ ...unapproved, labels: [label('risk:R1'), label('review:owner')] }) }).mode, 'approve', 'an owner hold stays with the Reviewer');
  const moved = pr({ isDraft: false, headRefOid: 'b'.repeat(40), reviews: [review('ready', 'APPROVED')] });
  assert.deepEqual([decide({ ...base, pr: moved }).agent, decide({ ...base, pr: moved }).mode], ['reviewer', 'review']);
});

test('an earlier Reviewer fixes review that holds an Owner decision keeps an approved PR with the Reviewer', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const held = { ...review('fixes'), body: `<!-- agent-review sha=${'a'.repeat(40)} round=1 verdict=fixes -->\nOwner decision: pick one` };
  const ready = pr({ isDraft: false, reviews: [held, review('ready')] });
  assert.equal(decide({ ...base, pr: ready }).mode, 'approve', 'the Owner decision stays with the Reviewer');
  const plain = pr({ isDraft: false, reviews: [review('fixes'), review('ready')] });
  assert.notEqual(decide({ ...base, pr: plain }).mode, 'approve', 'without it drive reaches its own step');
});

test('a draft behind its base brings the base in before its review; one already reviewed is not updated', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  assert.deepEqual(decide({ ...base, pr: pr({ mergeStateStatus: 'BEHIND' }) }), { do: 'update-branch' });
  assert.deepEqual(decide({ ...base, pr: pr({ mergeStateStatus: 'BEHIND', reviews: [review('ready')] }) }), { do: 'ready' });
});

test('overlap: while one PR waits on CI or merge the next ready issue starts, and merges stay one at a time in order', () => {
  const issues = { 3: started, 4: issue({ number: 4, labels: [label('risk:R1')], assessment: assessed() }), 5: issue({ number: 5, labels: [label('state:started'), label('risk:R1')], assessment: assessed() }) };
  const waiting = pr({ issue: 3, number: 53, isDraft: false, reviews: [review('ready', 'APPROVED')], autoMergeRequest: {} });
  const repo = fakeRepo({ issues: { 3: issues[3], 4: issues[4] }, trees: { 3: tree({ commits: 1 }) }, prs: [waiting] });
  const result = driveNext(repo.io, nextTargets(repo.io.openIssues()), lanes, {});
  assert.deepEqual([result.agent, result.issue], ['implementer', 4], 'the next issue builds while #3 waits for its merge');
  assert.deepEqual(result.alsoWaiting.map(entry => [entry.issue, entry.wait]), [[3, { pr: 53, until: 'merged' }]]);
  assert.equal(repo.s.prs.length, 1, 'no second PR is opened or merged by the overlap');
  // A later PR that is approved holds its auto-merge until the earlier one merges; every PR waiting returns the first wait.
  const second = pr({ issue: 4, number: 54, isDraft: false, reviews: [review('ready', 'APPROVED')] });
  const held = fakeRepo({ issues: { 3: issues[3], 4: { ...issues[4], labels: [label('state:started')] } }, trees: { 3: tree({ commits: 1 }), 4: tree({ commits: 1 }) }, prs: [waiting, second] });
  const out = driveNext(held.io, [3, 4], lanes, {});
  assert.deepEqual(out.wait, { pr: 53, until: 'merged' });
  assert.equal(held.calls.some(call => call[0] === 'auto-merge'), false, 'merges are serial');
  // Dependency order: an issue blocked by #3 is never started.
  const deps = { 3: { blockers: [], dropped: [] }, 4: { blockers: [3], dropped: [] } };
  assert.deepEqual([...nextTargets([{ number: 3, labels: [label('state:started')] }, { number: 4, labels: [] }], issue => deps[issue.number])], [3]);
});

const open = number => ({ number, kind: 'issue', state: 'OPEN' });
const closed = (number, extra = {}) => ({ number, kind: 'issue', state: 'CLOSED', reason: 'completed', merged: true, ...extra });

test('a dependency is met only once its change merged; unmet and dropped ones are told apart', () => {
  const split = deps => splitDependencies(deps);
  assert.deepEqual(split([open(4), { number: 5, kind: 'pr', state: 'OPEN' }]), { blockers: [4, 5], dropped: [] });
  assert.deepEqual(split([{ number: 5, kind: 'pr', state: 'MERGED', merged: true }, closed(6), closed(7, { merged: false, needsNoCode: true })]), { blockers: [], dropped: [] });
  assert.deepEqual(split([{ number: 5, kind: 'pr', state: 'CLOSED', merged: false }, closed(6, { reason: 'not_planned', merged: false }), closed(7, { merged: false })]), { blockers: [], dropped: [5, 6, 7] });
  assert.deepEqual(dependenciesFromIssueBody('```scope\n{"paths":["a/"],"dependencies":[12,"#13",12,"x"]}\n```'), [12, 13]);
  assert.deepEqual(dependenciesFromIssueBody('no packet'), []);
});

test('readDependencies unions blocked-by links with packet dependencies, issues and PRs', () => {
  const calls = [];
  const read = args => {
    calls.push(args.join(' '));
    const [kind, path] = args;
    if (path?.endsWith('/dependencies/blocked_by')) return [{ number: 12 }, { number: 20 }];
    if (path === 'repos/acme/app/issues/12') return { state: 'closed', state_reason: 'not_planned', labels: [], body: '' };
    if (path === 'repos/acme/app/issues/20') return { state: 'open', labels: [] };
    if (path === 'repos/acme/app/issues/30') return { state: 'open', pull_request: {} };
    if (kind === 'pr' && path === 'view') return { state: 'MERGED' };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const deps = readDependencies('acme/app', { number: 3, body: '```scope\n{"dependencies":[30]}\n```' }, read);
  assert.deepEqual(splitDependencies(deps), { blockers: [20], dropped: [12] });
  assert.deepEqual(deps.find(dep => dep.number === 30), { number: 30, kind: 'pr', state: 'MERGED', merged: true });
  const closer = nodes => args => (args[1] === 'graphql' ? { data: { repository: { issue: { closedByPullRequestsReferences: { nodes } } } } } : args[0] === 'api' && args[1].endsWith('blocked_by') ? [{ number: 7 }] : { state: 'closed', state_reason: 'completed', labels: [], body: '' });
  assert.deepEqual(splitDependencies(readDependencies('acme/app', { number: 3, body: '' }, closer([{ merged: false }]))), { blockers: [], dropped: [7] }, 'closed as completed with no merged PR is dropped');
  assert.deepEqual(splitDependencies(readDependencies('acme/app', { number: 3, body: '' }, closer([{ merged: false }, { merged: true }]))), { blockers: [], dropped: [] }, 'asks GitHub about the issue itself, however old its PR'
  );
});

test('an unmet dependency stops an item in every phase and keeps its worktree and PR', () => {
  const base = { issue: started, tree: tree({ commits: 1 }), blockers: [2] };
  const stop = { blocked: { issue: 3, by: [2] } };
  assert.deepEqual(decide({ issue: issue(), blockers: [2] }), stop, 'start');
  assert.deepEqual(decide({ issue: started, tree: tree(), blockers: [2] }), stop, 'build');
  assert.deepEqual(decide({ ...base, handBack: { status: 'done', commit: 'x', paths: ['a'] } }), stop, 'open');
  assert.deepEqual(decide({ ...base, pr: pr() }), stop, 'review');
  assert.deepEqual(decide({ ...base, pr: pr({ isDraft: false, reviews: [review('ready', 'APPROVED')] }) }), stop, 'merge');
  assert.deepEqual(decide({ ...base, pr: pr({ state: 'MERGED' }) }), { do: 'close' }, 'a merged PR still closes');
});

test('drive stops a started item that gains a blocker without touching its worktree or PR', () => {
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, isDraft: false, reviews: [review('ready', 'APPROVED')] })], blockers: { 3: [2] }, });
  assert.deepEqual(drive(repo.io, 3, lanes, {}), { blocked: { issue: 3, by: [2] } });
  assert.deepEqual(repo.calls, []);
  repo.s.blockers = {};
  assert.deepEqual(drive(repo.io, 3, lanes, {}).wait, { pr: 5, until: 'merged' }, 'unblocked, it merges again');
  assert.deepEqual(repo.calls.at(-1), ['auto-merge']);
});

test('a dropped dependency returns an owner step naming the dependent and the dependency', () => {
  const dropped = { 2: [closed(2, { reason: 'not_planned', merged: false })] };
  const repo = fakeRepo({ issues: { 3: issue(), 9: issue({ number: 9, labels: [label('type:epic')] }) }, deps: { 3: dropped[2], 9: dropped[2] } });
  const step = drive(repo.io, 3, lanes, {});
  assert.match(step.owner, /^#3 depends on #2, closed as not planned/);
  assert.equal(step.url, 'https://github.com/acme/app/issues/3');
  assert.deepEqual(repo.calls, []);
  assert.match(drive(repo.io, 9, lanes, {}).owner, /^#9 depends on #2/);
});

test('a dependency cycle in an epic returns an owner step naming it', () => {
  assert.deepEqual(findCycle([{ number: 12, blockers: [14] }, { number: 14, blockers: [12] }, { number: 15, blockers: [] }]), [12, 14, 12]);
  assert.equal(findCycle([{ number: 1, blockers: [2] }, { number: 2, blockers: [] }]), null);
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const slices = [{ number: 12, state: 'OPEN', blockers: [14] }, { number: 14, state: 'OPEN', blockers: [12] }];
  assert.equal(decideEpic({ epic, slices }).owner, 'epic #9: dependency cycle #12 → #14 → #12');
  const repo = fakeRepo({ issues: { 9: epic, 12: issue({ number: 12 }), 14: issue({ number: 14 }) }, subs: { 9: [12, 14] }, blockers: { 12: [14], 14: [12] } });
  assert.match(drive(repo.io, 9, lanes, {}).owner, /#12 → #14 → #12/);
  // Only the epic's refinement slice is set up; no slice in the cycle starts.
  assert.deepEqual(repo.calls, [['create-refinement', 99], ['blocker', 99, 12], ['blocker', 99, 14]]);
});

test('a slice with a dropped dependency or an epic blocked by an epic is not driven', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const slices = [{ number: 12, state: 'OPEN', blockers: [], dropped: [7] }];
  assert.match(decideEpic({ epic, slices }).owner, /#12 depends on #7/);
  const repo = fakeRepo({ issues: { 9: epic, 8: issue({ number: 8, labels: [label('type:epic')] }), 10: issue({ number: 10 }) }, subs: { 9: [10] }, blockers: { 9: [8] } });
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { blocked: { issue: 9, by: [8] } });
});

test('legacy type:task, type:chore and untyped slices are driven as stories', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, labels: [label('type:task')] }), 11: issue({ number: 11, labels: [label('type:chore')] }), 12: issue({ number: 12 }) }, subs: { 9: [10, 11, 12] } });
  const result = drive(repo.io, 9, lanes, {});
  assert.deepEqual([result.agent, result.mode, result.issue, result.alsoReady], ['implementer', 'build', 10, [11, 12]]);
});
test('a legacy open epic nested under an epic is reported, not driven or crashed on', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const repo = fakeRepo({ issues: { 9: epic, 8: issue({ number: 8, labels: [label('type:epic')] }), 10: issue({ number: 10 }) }, subs: { 9: [8, 10], 8: [] } });
  const result = drive(repo.io, 9, lanes, {});
  assert.equal(result.blocked.issue, 9);
  assert.match(result.blocked.reason, /nested epic #8; epics are never nested/);
  repo.s.issues[8].state = 'CLOSED';
  assert.equal(drive(repo.io, 9, lanes, {}).blocked, undefined, 'a closed nested epic no longer blocks');
});
test('the planner brief names the two-level backlog and sibling splits', () => {
  const brief = plannerBrief({ issue: issue({ number: 5 }), step: { mode: 'replan', reason: 'x' }, base: 'main', repo: 'acme/app' });
  assert.match(brief, /never a nested epic, `type:task` or `type:chore`; a split yields sibling stories or bugs under the same epic/);
});

test('--next takes the lowest-numbered ready item and skips unmet or dropped dependencies', () => {
  const items = [{ number: 2, labels: [] }, { number: 4, labels: [label('type:epic')] }, { number: 6, labels: [label('state:started')] }, { number: 7, labels: [] }];
  const deps = table => item => splitDependencies(table[item.number] || []);
  assert.equal(nextTarget(items, deps({})), 6, 'a ready started issue first');
  assert.equal(nextTarget(items, deps({ 6: [open(1)] })), 2, 'a started issue with a blocker yields to standalone issues');
  assert.equal(nextTarget(items, deps({ 6: [open(1)], 2: [open(4)] })), 4, 'an issue blocked by an epic waits for it');
  assert.equal(nextTarget(items, deps({ 6: [open(1)], 2: [open(4)], 4: [open(9)], 7: [closed(8, { reason: 'not_planned', merged: false })] })), null);
  const repo = fakeRepo({ issues: { 2: issue({ number: 2 }), 4: issue({ number: 4, labels: [label('type:epic')] }) }, blockers: { 2: [4] } });
  let said = '';
  const log = console.log; console.log = text => { said = text; };
  const lockDirectory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  try { driveCommand(['--next'], lanes, repo.io, { lockDirectory, session: 'test' }); } finally { console.log = log; rmSync(lockDirectory, { recursive: true, force: true }); }
  assert.deepEqual([JSON.parse(said).agent, JSON.parse(said).issue], ['planner', 4], 'drive --next picks the epic the issue waits for, not the blocked issue');
});

test('delivery assignments select configured hosts and models and reject unsupported hosts', () => {
  const delivery = { orchestrator: 'codex', roles: { reviewer: { host: 'codex', model: 'gpt-6.1-terra' }, implementer: { host: 'codex', model: 'gpt-6.1-terra' } } };
  assert.deepEqual(deliveryAssignment(delivery, { agent: 'reviewer' }, 'R2'), { host: 'codex', model: 'gpt-6.1-terra', effort: 'medium', session: 'separate' });
  assert.deepEqual(deliveryAssignment(delivery, { agent: 'implementer' }, 'R1'), { host: 'codex', model: 'gpt-6.1-terra', effort: 'medium', session: 'subagent' });
  assert.throws(() => deliveryAssignment(delivery, { agent: 'implementer', fresh: true }, 'R2'), /freshImplementer/);
  delivery.roles.freshImplementer = { host: 'codex', model: 'strongest-model' };
  assert.deepEqual(deliveryAssignment(delivery, { agent: 'implementer', fresh: true }, 'R2'), { host: 'codex', model: 'strongest-model', effort: 'medium', session: 'subagent' });
  assert.throws(() => deliveryAssignment({ orchestrator: 'agy', roles: {} }, { agent: 'reviewer' }, 'R1'), /unsupported/i);
  assert.throws(() => deliveryAssignment({ orchestrator: 'codex', roles: {} }, { agent: 'reviewer' }, 'R1'), /configure/i);
});

test('configured dispatch produces an implementer brief and accepts its intact hand-back', () => {
  const repo = fakeRepo({ issues: { 3: issue({ assessment: assessed('R1') }) } });
  const configured = { ...lanes, delivery: { orchestrator: 'codex', roles: { implementer: { host: 'codex', model: 'gpt-6.1-terra' } } } };
  const instruction = drive(repo.io, 3, configured, {});
  assert.deepEqual([instruction.agent, instruction.host, instruction.model, instruction.session], ['implementer', 'codex', 'gpt-6.1-terra', 'subagent']);
  assert.match(repo.writes[instruction.brief], /status: done \| replan \| blocked/);
  const handBack = parseHandBack('status: blocked\nnote: bounded dispatch probe');
  assert.deepEqual(drive(repo.io, 3, configured, handBack), { owner: '#3: bounded dispatch probe' });
});

test('the reviewer runs as a separate non-interactive session', () => {
  assert.throws(() => reviewerCommand('m', '/b', 'n', 'agy', '/bin/agy'), /Unsupported reviewer host/, 'AGY has no review adapter');
  assert.throws(() => reviewerCommand('m', '/b', 'n', 'other'), /Unsupported reviewer host/);
  const argv = reviewerCommand('opus', '/w/.wf/b.md', 'review-5-r1');
  assert.deepEqual(argv.slice(0, 2), ['claude', '--print']);
  assert.ok(argv.includes('--agent') && argv.includes('--permission-mode'));
});

test('check runs the test step in a free slot of two, and waits on one when both are busy', () => {
  assert.equal(chooseSlot(() => true), 'check-1');
  assert.equal(chooseSlot(name => name === 'check-2'), 'check-2');
  assert.ok(checkSlots.includes(chooseSlot(() => false, 7)));
  assert.equal(checkSlots.length, 2);
  const runs = [];
  const code = checkCommand(['--worktree', process.cwd()], lanes, { root: process.cwd(), directory: process.cwd(), probe: (_, name) => name === 'check-2', runner: (dir, names, cmd, args, opts) => { runs.push([names, cmd, args, opts.timeoutSeconds]); return { status: 0 }; } });
  assert.equal(code, 0);
  assert.deepEqual(runs, [[['check-2'], 'just', ['verify'], 3600]]);
  assert.throws(() => checkCommand(['--worktree', process.cwd()], { steps: {} }, { root: process.cwd(), directory: process.cwd(), probe: () => true, runner: () => ({ status: 0 }) }), /steps\.test/);
});

test('check lets at most two gates run at once on the machine', async t => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawn } = await import('node:child_process');
  const directory = mkdtempSync(join(tmpdir(), 'workflow-check-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'log');
  const gate = `const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},'+\\n');setTimeout(()=>fs.appendFileSync(${JSON.stringify(log)},'-\\n'),400)`;
  const module = new URL('../../plugins/common/workflow/scripts/lib/drive.mjs', import.meta.url).href;
  const script = `import {checkCommand} from ${JSON.stringify(module)}; process.exitCode = checkCommand(['--worktree', process.cwd()], { steps: { test: [process.execPath, '-e', ${JSON.stringify(gate)}] } }, { root: process.cwd(), directory: ${JSON.stringify(directory)} });`;
  const runs = Array.from({ length: 3 }, () => new Promise(resolve => spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' }).on('exit', resolve)));
  assert.deepEqual(await Promise.all(runs), [0, 0, 0]);
  let running = 0; let peak = 0;
  for (const mark of readFileSync(log, 'utf8').trim().split('\n')) { running += mark === '+' ? 1 : -1; peak = Math.max(peak, running); }
  assert.ok(peak >= 1 && peak <= 2, `peak ${peak}`);
});

test('epic refinement ambiguity goes to the planner before mutation', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, title: 'Refinement' }) }, subs: { 9: [10] } });
  const result = drive(repo.io, 9, lanes, {});
  assert.equal(result.owner, undefined);
  assert.equal(result.agent, 'planner');
  assert.match(result.reason, /#10/);
  assert.deepEqual(repo.calls, []);
});

test('two live refinement candidates return the planner instruction, never an owner step', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  for (const bodies of [
    ['<!-- workflow:epic-refinement -->', '<!-- workflow:epic-refinement -->'],
    ['<!-- workflow:epic-refinement -->', 'Review the merged whole epic against its Outcome, Decisions and architecture rules'],
  ]) {
    const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, body: bodies[0] }), 11: issue({ number: 11, body: bodies[1] }) }, subs: { 9: [10, 11] } });
    const result = drive(repo.io, 9, lanes, {});
    assert.equal(result.owner, undefined);
    assert.equal(result.agent, 'planner');
    assert.match(result.reason, /#10, #11/);
    assert.deepEqual(repo.calls, []);
  }
});

test('a refinement candidate closed as not planned or consolidated is retired, not a rival', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const marker = '<!-- workflow:epic-refinement -->';
  for (const retired of [
    issue({ number: 10, state: 'CLOSED', stateReason: 'NOT_PLANNED', body: marker }),
    issue({ number: 10, state: 'CLOSED', body: `${marker}\n<!-- workflow:consolidated-into 11 -->` }),
  ]) {
    const repo = fakeRepo({ issues: { 9: epic, 10: retired, 11: issue({ number: 11, body: marker }) }, subs: { 9: [10, 11] } });
    const result = drive(repo.io, 9, lanes, {});
    assert.doesNotMatch(result.owner || '', /classify/);
    assert.notEqual(result.mode, 'refinement');
  }
});

test('the planner consolidating refinement candidates lets drive continue', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const marker = '<!-- workflow:epic-refinement -->';
  const first = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, body: marker }), 11: issue({ number: 11, body: marker }) }, subs: { 9: [10, 11] } });
  assert.equal(drive(first.io, 9, lanes, {}).agent, 'planner');
  const after = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, body: marker }), 11: issue({ number: 11, state: 'CLOSED', stateReason: 'NOT_PLANNED', body: `${marker}\n<!-- workflow:consolidated-into 10 -->` }) }, subs: { 9: [10, 11] } });
  const result = drive(after.io, 9, lanes, { status: 'consolidated', into: '10', closed: '11' });
  assert.doesNotMatch(result.owner || '', /classify/);
  assert.notEqual(result.mode, 'refinement');
});

test('a closed or merely refine-titled sub-issue is not a refinement candidate', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  for (const child of [
    issue({ number: 10, state: 'CLOSED', title: 'fix(x): refine re-checks a recorded wait' }),
    issue({ number: 10, state: 'CLOSED', title: 'Refinement' }),
    issue({ number: 10, title: 'fix(x): refine re-checks a recorded wait' }),
  ]) {
    const repo = fakeRepo({ issues: { 9: epic, 10: child }, subs: { 9: [10] } });
    const result = drive(repo.io, 9, lanes, {});
    assert.doesNotMatch(result.owner || '', /classify/);
    assert.deepEqual(repo.calls[0], ['create-refinement', 99]);
  }
});

test('refinement is created once, repaired for new slices and waits for merged closing PRs', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10 }) }, subs: { 9: [10] } });
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 10);
  assert.deepEqual(repo.calls.slice(0, 2), [['create-refinement', 99], ['blocker', 99, 10]]);
  drive(repo.io, 9, lanes, {});
  assert.equal(repo.calls.filter(call => call[0] === 'create-refinement').length, 1);
  assert.equal(repo.calls.filter(call => call[0] === 'blocker').length, 1);
  repo.s.issues[11] = issue({ number: 11 });
  repo.s.subs[9].push(11);
  drive(repo.io, 9, lanes, {});
  assert.ok(repo.calls.some(call => call.join(',') === 'blocker,99,11'));
  repo.s.issues[10].state = 'CLOSED';
  repo.s.issues[11].state = 'CLOSED';
  assert.match(drive(repo.io, 9, lanes, {}).owner, /#10, #11/);
  repo.s.merged = [10, 11];
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 99);
  assert.equal(repo.s.issues[9].state, 'OPEN');
  repo.s.issues[99].state = 'CLOSED';
  assert.match(drive(repo.io, 9, lanes, {}).owner, /#99/);
  repo.s.merged.push(99);
  const improvement = drive(repo.io, 9, lanes, {});
  assert.deepEqual([improvement.agent, improvement.mode, improvement.issue], ['improver', 'improve', 9]);
  assert.match(repo.writes[improvement.brief], /Invoke the `improve` skill/);
  assert.deepEqual(drive(repo.io, 9, lanes, {}), improvement);
  repo.s.lessons = [9];
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
});

test('closed nested epics require merged closing PRs for every descendant slice', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const nested = issue({ number: 10, state: 'CLOSED', labels: [label('type:epic')] });
  const repo = fakeRepo({ issues: { 9: epic, 10: nested, 11: issue({ number: 11, state: 'CLOSED' }), 12: issue({ number: 12, state: 'CLOSED' }) }, subs: { 9: [10], 10: [11, 12] }, merged: [11, 12] });
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 99);
  repo.s.merged = [11];
  assert.match(drive(repo.io, 9, lanes, {}).owner, /#12/);
  repo.s.subs[10] = [];
  assert.match(drive(repo.io, 9, lanes, {}).owner, /#10/);
  repo.s.subs[10] = [10];
  assert.match(drive(repo.io, 9, lanes, {}).owner, /#10/);
});

test('a closed slice without a merged closing PR holds only refinement and epic completion', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, state: 'CLOSED' }), 11: issue({ number: 11 }) }, subs: { 9: [10, 11] } });
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 11, 'other open slices still deliver');
  repo.s.issues[11].state = 'CLOSED';
  repo.s.merged = [11];
  const held = drive(repo.io, 9, lanes, {});
  assert.match(held.owner, /missing closing PR merged into main for #10$/);
  assert.equal(repo.s.issues[99].labels.length, 0, 'refinement does not start');
  repo.s.issues[99].state = 'CLOSED';
  repo.s.merged.push(99);
  repo.s.lessons = [9];
  assert.match(drive(repo.io, 9, lanes, {}).owner, /#10$/);
  assert.equal(repo.s.issues[9].state, 'OPEN', 'the epic stays open');
  repo.s.merged.push(10);
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
});

test('refinement creation atomically links the parent even when the response is lost', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')], milestone: { title: 'M' } });
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10 }) }, subs: { 9: [10] } });
  const gh = args => {
    const query = args.find(arg => arg.startsWith('query=')) || '';
    if (query.includes('query(')) return { data: { repository: { id: 'R', issue: { id: 'E', milestone: { id: 'M' } } } } };
    assert.match(query, /parentIssueId/);
    assert.ok(args.includes('parent=E'));
    const refinement = issue({ number: 99, title: 'refine', body: '<!-- workflow:epic-refinement -->' });
    repo.s.issues[99] = refinement;
    repo.s.subs[9].push(99);
    throw new Error('response lost');
  };
  repo.io.createRefinement = githubIo(lanes, gh).createRefinement;
  assert.throws(() => drive(repo.io, 9, lanes, {}), /response lost/);
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 10);
  assert.deepEqual(repo.s.subs[9], [10, 99]);
});


test('epic closure requires freshly authenticated evidence before closing', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
  repo.io.verifyEpic = () => ({ complete: false, issues: ['unverified'] });
  const result = drive(repo.io, 9, lanes, {});
  assert.match(result.owner, /unverified/);
  assert.equal(repo.s.issues[9].state, 'OPEN');
});

test('unmet epic criteria create and reuse one follow-up while failures hold closure', () => {
  const make = () => {
    const epic = issue({ number: 9, labels: [label('type:epic')], body: '- [ ] Works <!-- workflow:criterion a -->' });
    const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
    const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
    repo.io.verifyEpic = () => ({ complete: false, issues: ['unmet'], outstanding: [{ id: 'a', text: 'Works', nextAction: 'Fix gap' }] });
    repo.io.uncheckEpicCriteria = () => { repo.s.unchecked = true; };
    repo.io.createEpicFollowUp = () => {
      const child = issue({ number: 100, body: '<!-- workflow:epic-follow-up 9 a -->\nFix gap' });
      repo.s.issues[100] = child; repo.s.subs[9].push(100); return child;
    };
    return repo;
  };
  const repo = make();
  assert.match(drive(repo.io, 9, lanes, {}).owner, /unmet/);
  assert.equal(repo.s.unchecked, true);
  assert.equal(repo.s.board[9], 'BLOCKED');
  assert.equal(repo.s.board[100], 'TODO');
  drive(repo.io, 9, lanes, {});
  assert.deepEqual(repo.s.subs[9], [99, 100]);
  assert.equal(repo.s.issues[9].state, 'OPEN');
  for (const method of ['uncheckEpicCriteria', 'createEpicFollowUp', 'requiredBoard']) {
    const f = make(); f.io[method] = () => { throw Error('write failed'); };
    assert.match(drive(f.io, 9, lanes, {}).owner, /write failed/);
    assert.equal(f.s.issues[9].state, 'OPEN');
  }
});

test('epic closure rechecks inputs and holds on a failed or changed second read', () => {
  for (const changed of [false, true]) {
    const epic = issue({ number: 9, labels: [label('type:epic')] });
    const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
    const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
    let calls = 0;
    repo.io.verifyEpic = () => ++calls === 1 ? { complete: true, issues: [], revision: 1 } : changed ? { complete: true, issues: [], revision: 2 } : { complete: false, issues: ['unavailable'] };
    assert.match(drive(repo.io, 9, lanes, {}).owner, /changed/);
    assert.equal(repo.s.issues[9].state, 'OPEN');
  }
});

test('a follow-up survives a board failure and is reused on retry', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')], body: '- [ ] Works <!-- workflow:criterion a -->' });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
  repo.io.verifyEpic = () => ({ complete: false, issues: ['unmet'], outstanding: [{ id: 'a', text: 'Works', nextAction: 'Fix gap' }] });
  repo.io.uncheckEpicCriteria = () => {};
  let creates = 0; let failBoard = true;
  repo.io.createEpicFollowUp = () => { creates++; const child = issue({ number: 100, body: '<!-- workflow:epic-follow-up 9 a -->\nFix gap' }); repo.s.issues[100] = child; repo.s.subs[9].push(100); return child; };
  repo.io.requiredBoard = n => { if (n === 100 && failBoard) throw Error('board failed'); };
  assert.match(drive(repo.io, 9, lanes, {}).owner, /board failed/);
  failBoard = false;
  drive(repo.io, 9, lanes, {});
  assert.equal(creates, 1);
  assert.equal(repo.s.issues[9].state, 'OPEN');
});

function followUpFixture(children) {
  const epic = issue({ number: 9, labels: [label('type:epic')], body: '- [ ] Works <!-- workflow:criterion a -->' });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const issues = { 9: epic, 99: refinement };
  const subs = [99];
  for (const [number, state] of children) { issues[number] = issue({ number, state, body: '<!-- workflow:epic-follow-up 9 a -->\nFix gap' }); subs.push(number); }
  const repo = fakeRepo({ issues, subs: { 9: subs }, merged: [99, ...children.filter(([, , merged]) => merged).map(([number]) => number)], lessons: [9] });
  repo.io.verifyEpic = () => ({ complete: false, issues: ['unmet'], outstanding: [{ id: 'a', text: 'Works', nextAction: 'Fix gap' }] });
  repo.io.uncheckEpicCriteria = () => {};
  repo.creates = 0;
  repo.io.createEpicFollowUp = () => { repo.creates++; const child = issue({ number: 100, body: '<!-- workflow:epic-follow-up 9 a -->\nFix gap' }); repo.s.issues[100] = child; repo.s.subs[9].push(100); return child; };
  return repo;
}

test('a closed follow-up delivered by a merged PR gets a new follow-up for the unmet criterion', () => {
  const repo = followUpFixture([[595, 'CLOSED', true]]);
  const result = drive(repo.io, 9, lanes, {});
  assert.doesNotMatch(result.owner || '', /classification/);
  assert.equal(repo.creates, 1);
  assert.equal(repo.s.issues[9].state, 'OPEN');
});

test('a closed follow-up without a merged closing PR stops at the owner with the evidence', () => {
  const repo = followUpFixture([[595, 'CLOSED', false]]);
  const result = drive(repo.io, 9, lanes, {});
  assert.match(result.owner, /#595/);
  assert.equal(repo.creates, 0);
});

test('an undelivered closed follow-up stops closure even while another slice is open', () => {
  const repo = followUpFixture([[595, 'CLOSED', false]]);
  repo.s.issues[700] = issue({ number: 700 });
  repo.s.subs[9].push(700);
  const result = drive(repo.io, 9, lanes, {});
  assert.equal(repo.creates, 0);
  assert.match(result.owner || '', /#595/);
});

test('a follow-up closed as not planned stops closure instead of creating a new one', () => {
  const repo = followUpFixture([[595, 'CLOSED', false]]);
  repo.s.issues[595].stateReason = 'NOT_PLANNED';
  const result = drive(repo.io, 9, lanes, {});
  assert.equal(repo.creates, 0);
  assert.match(result.owner || '', /#595/);
});

test('one open follow-up is reused even beside a delivered closed one', () => {
  const repo = followUpFixture([[595, 'CLOSED', true], [596, 'OPEN', false]]);
  drive(repo.io, 9, lanes, {});
  assert.equal(repo.creates, 0);
});

test('several open follow-ups for one criterion stop with a classification request naming them', () => {
  const repo = followUpFixture([[595, 'OPEN', false], [596, 'OPEN', false]]);
  const result = drive(repo.io, 9, lanes, {});
  assert.match(result.owner, /#595, #596.*need classification/);
  assert.equal(repo.creates, 0);
});

// Every follow-up state closure can meet for one unmet criterion, with the outcome drive must name for it.
// Removing a row, or a state without an outcome, fails the test.
const closureStates = ['none', 'open', 'closed delivered', 'closed not planned', 'closed duplicate of a delivered issue', 'closed duplicate of an undelivered issue', 'closed undelivered', 'two open'];
const closureRows = [
  { state: 'none', children: [], outcome: 'create' },
  { state: 'open', children: [[595, 'OPEN', false]], outcome: 'reuse' },
  { state: 'closed delivered', children: [[595, 'CLOSED', true]], outcome: 'create' },
  { state: 'closed not planned', children: [[595, 'CLOSED', false]], notPlanned: 595, outcome: 'owner', owner: /#595/ },
  { state: 'closed duplicate of a delivered issue', children: [[595, 'CLOSED', false]], duplicateOf: [595, 700, true], outcome: 'create' },
  { state: 'closed duplicate of an undelivered issue', children: [[595, 'CLOSED', false]], duplicateOf: [595, 700, false], outcome: 'owner', owner: /#700/ },
  { state: 'closed undelivered', children: [[595, 'CLOSED', false]], outcome: 'owner', owner: /#595/ },
  { state: 'two open', children: [[595, 'OPEN', false], [596, 'OPEN', false]], outcome: 'owner', owner: /#595, #596.*need classification/ },
];
test('epic closure names an outcome for every follow-up state, with the board present or absent', () => {
  assert.deepEqual(closureRows.map(row => row.state), closureStates, 'every closure state has exactly one row');
  for (const row of closureRows) for (const board of ['present', 'absent']) {
    const label = `${row.state}, board ${board}`;
    const repo = followUpFixture(row.children);
    if (row.notPlanned) repo.s.issues[row.notPlanned].stateReason = 'NOT_PLANNED';
    if (row.duplicateOf) {
      const [duplicate, target, delivered] = row.duplicateOf;
      repo.s.issues[duplicate].body += `\n<!-- workflow:consolidated-into ${target} -->`;
      repo.s.issues[target] = issue({ number: target, state: 'CLOSED' });
      if (delivered) repo.s.merged.push(target);
    }
    const boardCalls = [];
    repo.io.requiredBoard = (n, value) => { if (board === 'absent') return false; boardCalls.push([n, value]); return undefined; };
    const result = drive(repo.io, 9, lanes, {});
    // A reused open follow-up becomes the next instruction, a new one waits on the outcome review; a verification failure is the owner step a row names.
    const waiting = /update the epic outcome review/.test(result.owner || '');
    const outcome = result.owner && !waiting ? 'owner' : repo.creates === 1 ? 'create' : (waiting || result.agent) && repo.creates === 0 ? 'reuse' : 'unnamed';
    assert.equal(outcome, row.outcome, `${label}: ${JSON.stringify(result)}`);
    if (row.owner) assert.match(result.owner, row.owner, label);
    assert.equal(repo.s.issues[9].state, 'OPEN', `${label}: the epic stays open`);
    // A retired slice (not planned or a consolidated duplicate) never becomes a blocker of the refinement.
    assert.equal((repo.s.blockers?.[99] || []).includes(595) && Boolean(row.notPlanned || row.duplicateOf), false, `${label}: retired slice linked as a blocker`);
    if (board === 'present' && row.outcome !== 'owner') assert.deepEqual(boardCalls.map(call => call[1]), ['BLOCKED', 'TODO'], label);
  }
});

test('criterion lines with text after the marker are still covered and unchecked', t => {
  const body = '### Acceptance criteria\n- [ ] Benchmark the parser <!-- workflow:criterion bench --> (owner: dev)\n- [x] Works <!-- workflow:criterion works --> note\n';
  const uncovered = decideEpic({ epic: issue({ number: 9, body }), slices: [{ number: 10, state: 'OPEN', blockers: [], body: 'x' }] }).uncovered;
  assert.deepEqual(uncovered.map(c => [c.id, c.text]), [['bench', 'Benchmark the parser']]);
  const covered = decideEpic({ epic: issue({ number: 9, body }), slices: [{ number: 10, state: 'OPEN', blockers: [], body: 'cites bench' }] }).uncovered || [];
  assert.deepEqual(covered, []);
  const dir = mkdtempSync(join(tmpdir(), 'gh-stub-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'body.txt');
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = "--body" ] && printf '%s' "$2" > ${JSON.stringify(out)}; shift; done\n`, { mode: 0o755 });
  const module = new URL('../../plugins/common/workflow/scripts/lib/drive.mjs', import.meta.url).href;
  const code = `import { githubIo } from ${JSON.stringify(module)}; githubIo(${JSON.stringify(lanes)}, () => ({})).uncheckEpicCriteria({ number: 9, body: ${JSON.stringify(body)} }, ['works']);`;
  const result = run(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(out, 'utf8'), /- \[ \] Works <!-- workflow:criterion works --> note/);
});

test('production epic board updates fail when the board is unavailable', () => {
  const io = githubIo({ ...lanes, repo: 'acme/app' }, () => { throw Error('unavailable'); });
  assert.equal(typeof io.requiredBoard, 'function');
  assert.throws(() => io.requiredBoard(9, 'BLOCKED'));
});

test('required board updates are skipped when the repository has no board', t => {
  const f = fixture(t);
  const common = f.git('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'workflow-metadata-cache.json'), JSON.stringify({ 'acme/app': { fields: { project: { at: Date.now(), value: false } } } }));
  const module = new URL('../../plugins/common/workflow/scripts/lib/drive.mjs', import.meta.url).href;
  const code = `import { githubIo } from ${JSON.stringify(module)}; const io = githubIo(${JSON.stringify(lanes)}, () => ({})); io.requiredBoard(9, 'BLOCKED'); io.requiredBoard(10, 'TODO');`;
  const result = run(process.execPath, ['--input-type=module', '-e', code], { cwd: f.repo, env: f.env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no GitHub Project board; status skipped/);
});

test('drive updates the PR change and supplied evidence after a fix', () => {
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, body: 'Closes #3\n\n## Change\n\nOld change\n\n## Verification\n\nPassed.', reviews: [review('fixes')] })] });
  const handBack = parseHandBack('status: done\ncommit: fix: change\npaths: a.js\ncheck: pass\nnote: New change\nbody: Before and after captures');
  drive(repo.io, 3, lanes, handBack);
  assert.match(repo.s.prs[0].body, /## Change\n\nNew change/);
  assert.match(repo.s.prs[0].body, /## Evidence\n\nBefore and after captures/);
});


test('replacing evidence removes nested headings and preserves later sections', () => {
  const original = updatePrBody('## Change\n\nOld\n\n## Verification\n\nPassed.\n', {}, '## Before\n\nOld capture\n\n## After\n\nOld result');
  const updated = updatePrBody(`${original}\n## Notes\n\nKeep this.\n`, {}, '## After\n\nNew capture');
  assert.doesNotMatch(updated, /Old capture|Old result/);
  assert.match(updated, /## After\n\nNew capture/);
  assert.match(updated, /## Notes\n\nKeep this/);
});

test('replacing unmarked evidence preserves later sections', () => {
  const original = '## Change\n\nDone.\n\n## Evidence\n\nCapture\n\n## Verification\n\nKeep this.\n';
  const updated = updatePrBody(original, {}, 'New capture');
  assert.doesNotMatch(updated, /\nCapture\n/);
  assert.match(updated, /## Verification\n\nKeep this/);
  assert.match(updated, /workflow:evidence-start[\s\S]*New capture[\s\S]*workflow:evidence-end/);
});


test('a fully evidenced parent closes with a delivered nested epic', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')], body: '### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n' });
  const nested = issue({ number: 10, state: 'CLOSED', labels: [label('type:epic')] });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 10: nested, 11: issue({ number: 11, state: 'CLOSED' }), 99: refinement }, subs: { 9: [10, 99], 10: [11] }, merged: [11, 99], lessons: [9] });
  repo.io.verifyEpic = (current, children, base, merged) => verifyEpicClosure({ epic: current, slices: children, base, repo: 'a/b' }, {
    merged, native: () => ({ version: 1, epic: 9, children: [10, 99], outcomes: [{ criterion: { id: 'a', text: 'Works' }, state: 'met', explanation: 'The evidence demonstrates the outcome.', evidence: ['https://example.org/proof'] }] })
  });
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
});

test('native incomplete review creates a follow-up once across a partial board failure', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')], body: '### Acceptance criteria\n- [ ] Works <!-- workflow:criterion a -->\n' });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
  const packet = { version: 1, epic: 9, children: [99], outcomes: [{ criterion: { id: 'a', text: 'Works' }, state: 'unmet', explanation: 'The evidence shows the remaining gap.', nextAction: 'Fix gap', evidence: ['https://example.org/proof'] }] };
  repo.io.verifyEpic = (current, children, base, merged) => verifyEpicClosure({ epic: current, slices: children, base, repo: 'acme/app' }, { merged, native: () => packet });
  repo.io.uncheckEpicCriteria = () => {};
  let creates = 0; let failBoard = true;
  repo.io.createEpicFollowUp = () => { creates++; const child = issue({ number: 100, body: '<!-- workflow:epic-follow-up 9 a -->\nFix gap' }); repo.s.issues[100] = child; repo.s.subs[9].push(100); return child; };
  repo.io.requiredBoard = (n, state) => { if (n === 100 && failBoard) throw Error('board failed'); (repo.s.board ||= {})[n] = state; };
  assert.match(drive(repo.io, 9, lanes, {}).owner, /board failed/);
  failBoard = false;
  packet.children.push(100);
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 100);
  assert.equal(creates, 1);
  assert.equal(repo.s.board[100], 'PROGRESS');
  assert.equal(repo.s.issues[9].state, 'OPEN');
});

test('native review refuses unaccounted linked work without creating follow-ups', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')], body: '### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n' });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, state: 'CLOSED' }), 99: refinement }, subs: { 9: [10, 99] }, merged: [10, 99], lessons: [9] });
  repo.io.verifyEpic = (current, children, base, merged) => verifyEpicClosure({ epic: current, slices: children, base, repo: 'acme/app' }, { merged, native: () => ({ version: 1, epic: 9, children: [99], outcomes: [{ criterion: { id: 'a', text: 'Works' }, state: 'met', explanation: 'The evidence demonstrates the outcome.', evidence: ['https://example.org/proof'] }] }) });
  const step = drive(repo.io, 9, lanes, {});
  assert.equal(step.owner, undefined, 'a stale outcome comment is the Reviewer\'s to refresh');
  assert.match(step.reason, /inventory is stale/);
  assert.deepEqual(repo.s.subs[9], [10, 99]);
  assert.equal(repo.s.issues[9].state, 'OPEN');
});


test('a fully merged epic without an outcome comment dispatches the Reviewer, then closes on met and holds on unmet', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')], body: '### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n' });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
  let packet = null;
  repo.io.verifyEpic = (current, children, base, merged) => verifyEpicClosure({ epic: current, slices: children, base, repo: 'acme/app' }, {
    merged, native: () => { if (!packet) throw Object.assign(new Error('The configured Reviewer has not posted an epic outcome comment'), { needsReview: true }); return packet; }
  });
  const step = drive(repo.io, 9, lanes, {});
  assert.deepEqual([step.agent, step.mode, step.session, step.model, step.issue, step.pr, step.owner], ['reviewer', 'epic-outcome', 'separate', 'opus', 9, null, undefined]);
  assert.match(step.reason, /has not posted an epic outcome comment/);
  assert.ok(step.command.includes('--agent') && step.command.includes('filipkrawiec-workflow:reviewer'), 'a separate Reviewer session');
  assert.ok(step.command.includes('--output-format'), 'machine-readable usage output is requested');
  const wrapper = step.command.findIndex(part => String(part).endsWith('review-session.mjs'));
  assert.deepEqual(step.command.slice(wrapper + 1, wrapper + 3), ['--epic', '9'], 'the wrapper records usage on the epic and claims no PR');
  const brief = repo.writes[step.brief];
  assert.match(brief, /epic #9 outcome review/);
  assert.match(brief, /unmet.*nextAction/s);
  assert.equal(repo.s.issues[9].state, 'OPEN');
  // The Reviewer posts met: drive closes the epic.
  packet = { version: 1, epic: 9, children: [99], outcomes: [{ criterion: { id: 'a', text: 'Works' }, state: 'met', explanation: 'The merged PR shows it.', evidence: ['https://example.org/proof'] }] };
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
  // An unmet verdict goes to the owner with a follow-up, never closes.
  const open = issue({ number: 9, labels: [label('type:epic')], body: '### Acceptance criteria\n- [ ] Works <!-- workflow:criterion a -->\n' });
  const held = fakeRepo({ issues: { 9: open, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
  const unmet = { ...packet, outcomes: [{ ...packet.outcomes[0], state: 'unmet', nextAction: 'Fix gap' }] };
  held.io.verifyEpic = (current, children, base, merged) => verifyEpicClosure({ epic: current, slices: children, base, repo: 'acme/app' }, { merged, native: () => unmet });
  held.io.uncheckEpicCriteria = () => {};
  held.io.createEpicFollowUp = () => { const child = issue({ number: 100, body: '<!-- workflow:epic-follow-up 9 a -->\nFix gap' }); held.s.issues[100] = child; held.s.subs[9].push(100); return child; };
  assert.match(drive(held.io, 9, lanes, {}).owner, /Fix gap/);
  assert.equal(held.s.issues[9].state, 'OPEN');
  // An owner-lane epic still goes to the owner.
  const owned = fakeRepo({ issues: { 9: issue({ ...epic, labels: [label('type:epic'), label('lane:owner')] }), 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
  assert.ok(drive(owned.io, 9, lanes, {}).owner);
});

test('an epic created without criterion IDs gets them, is judged by the Reviewer, has met criteria ticked and closes', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')], body: '## Outcome\nx\n\n### Acceptance criteria\n- [ ] Users can sign in\n- [ ] Users can sign out\n\n## Notes\n- [ ] not a criterion\n' });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
  repo.io.editEpicBody = (e, body) => { repo.s.issues[e.number].body = body; };
  let packet = null;
  repo.io.verifyEpic = (current, children, base, merged) => verifyEpicClosure({ epic: current, slices: children, base, repo: 'acme/app' }, {
    merged, native: () => { if (!packet) throw Object.assign(new Error('The configured Reviewer has not posted an epic outcome comment'), { needsReview: true }); return packet; }
  });
  const step = drive(repo.io, 9, lanes, {});
  assert.equal(step.agent, 'reviewer');
  assert.match(repo.s.issues[9].body, /- \[ \] Users can sign in <!-- workflow:criterion users-can-sign-in -->/);
  assert.match(repo.s.issues[9].body, /- \[ \] Users can sign out <!-- workflow:criterion users-can-sign-out -->/);
  assert.match(repo.s.issues[9].body, /- \[ \] not a criterion\n/, 'other sections stay as they are');
  const met = (id, text) => ({ criterion: { id, text }, state: 'met', explanation: 'The merged PR shows it.', evidence: ['https://example.org/proof'] });
  packet = { version: 1, epic: 9, children: [99], outcomes: [met('users-can-sign-in', 'Users can sign in'), met('users-can-sign-out', 'Users can sign out')] };
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
  assert.match(repo.s.issues[9].body, /- \[x\] Users can sign in <!-- workflow:criterion users-can-sign-in -->/);
  assert.match(repo.s.issues[9].body, /- \[x\] Users can sign out/);
  assert.equal(repo.s.issues[9].state, 'CLOSED');
});

test('an epic that turns owner-lane before closing keeps its body without criterion IDs', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')], body: '### Acceptance criteria\n- [ ] Users can sign in\n' });
  const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, merged: [99], lessons: [9] });
  const edits = [];
  repo.io.editEpicBody = (e, body) => edits.push(body);
  const read = repo.io.issue;
  let reads = 0;
  repo.io.issue = n => { const found = read(n); return n === 9 && ++reads > 1 ? { ...found, labels: [label('type:epic'), label('lane:owner')] } : found; };
  try { drive(repo.io, 9, lanes, {}); } catch { /* the owner lane may surface as an error or a step */ }
  assert.deepEqual(edits, []);
});

test('criterion IDs are added once, stay unique and keep existing ones', () => {
  const body = '### Acceptance criteria\n- [x] Same <!-- workflow:criterion keep -->\n- [ ] Same\n- [ ] Same\n- [ ] !!!\n';
  const once = addCriterionIds(body);
  assert.match(once, /Same <!-- workflow:criterion keep -->/);
  assert.match(once, /- \[ \] Same <!-- workflow:criterion same -->/);
  assert.match(once, /- \[ \] Same <!-- workflow:criterion same-2 -->/);
  assert.match(once, /- \[ \] !!! <!-- workflow:criterion criterion-3 -->/);
  assert.equal(addCriterionIds(once), once);
});

test('verified consolidated children and refinements close an epic without another PR', () => {
  for (const consolidated of [10, 99]) {
    const epic = issue({ number: 9, labels: [label('type:epic')] });
    const refinement = issue({ number: 99, state: 'CLOSED', body: '<!-- workflow:epic-refinement -->' });
    const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, state: 'CLOSED' }), 99: refinement }, subs: { 9: [10, 99] }, merged: [consolidated === 10 ? 99 : 10], lessons: [9] });
    repo.io.consolidatedDelivery = (parent, child) => parent === 9 && child.number === consolidated;
    assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
  }
});

test('a current-head Reviewer verdict after the claim releases it immediately', () => {
  const since = Date.parse('2026-11-11T10:00:00Z');
  const claimed = pr({ labels: [label('risk:R1'), label('state:reviewing')], reviews: [{ ...review('owner', 'APPROVED'), submittedAt: '2026-11-11T10:01:00Z' }] });
  assert.deepEqual(decide({ issue: started, tree: tree({ commits: 1 }), pr: claimed, reviewingSince: since, now: since + 120_000 }), { do: 'release-review' });
});

test('base conflicts always return to the implementer, even after the fresh round', () => {
  const reviews = Array.from({ length: 5 }, () => review('fixes'));
  const step = decide({ issue: started, tree: tree({ commits: 1 }), pr: pr({ mergeable: 'CONFLICTING', reviews }) });
  assert.equal(step.agent, 'implementer');
  assert.match(step.reason, /conflicts with its base/);
});

const blockingReview = { ...review('fixes'), body: `<!-- agent-review sha=${head} round=1 verdict=fixes -->\n**Blocker** src/a.mjs:4 rejects nothing when the head is unchanged.\n**Nit** rename x` };

test('a fix-mode hand-back at the judged head is rejected and the fix reruns with the finding quoted', () => {
  const step = decide({ issue: started, tree: tree({ commits: 1 }), pr: pr({ reviews: [blockingReview] }), handBack: { status: 'done', note: 'Corrected PR evidence' } });
  assert.deepEqual([step.agent, step.mode, step.resume], ['implementer', 'fix', true]);
  assert.match(step.reason, /unchanged|judged head/);
  assert.equal(step.findings.length, 1);
  assert.match(step.findings[0], /src\/a\.mjs:4 rejects nothing/);
  assert.doesNotMatch(step.findings.join('\n'), /rename x/);
});

test('a disputed fix-mode hand-back goes to the Reviewer instead of looping the implementer', () => {
  const step = decide({ issue: started, tree: tree({ commits: 1 }), pr: pr({ reviews: [blockingReview] }), handBack: { status: 'disputed', note: 'the finding misreads line 4' } });
  assert.equal(step.agent, 'reviewer');
  assert.equal(step.sameHead, true);
  assert.equal(step.dispute, 'the finding misreads line 4');
});

test('a fix-mode brief offers disputed and the Reviewer brief carries the dispute evidence', () => {
  const fixBrief = implementerBrief({ issue: started, tree: tree(), pr: pr(), step: { mode: 'fix', reason: 'blocking review findings' }, base: 'main' });
  assert.match(fixBrief, /status: done \| disputed \| replan \| blocked/);
  const buildBrief = implementerBrief({ issue: started, tree: tree(), pr: pr(), step: { mode: 'build' }, base: 'main' });
  assert.doesNotMatch(buildBrief, /disputed/);
  const reviewText = reviewerBrief({ repo: 'acme/app', pr: pr(), issue: issue(), risk: 'R1', step: { mode: 'review', sameHead: true, dispute: 'the finding misreads line 4', round: 2 }, lanes, base: 'main' });
  assert.match(reviewText, /disputes[\s\S]*the finding misreads line 4/);
});

test('a fix-mode brief quotes the blocking findings, not only a pointer to review-context', () => {
  const brief = implementerBrief({ issue: started, tree: tree(), pr: pr(), step: { mode: 'fix', reason: 'blocking review findings', findings: ['src/a.mjs:4 rejects nothing'] }, base: 'main' });
  assert.match(brief, /Blocking findings[\s\S]*src\/a\.mjs:4 rejects nothing/);
});

test('a structured conflict-only verdict sends the implementer to merge the base at every round', () => {
  const conflict = { ...review('fixes'), body: `<!-- agent-review sha=${head} round=5 verdict=fixes finding=base-conflict -->` };
  const reviews = [...Array.from({ length: 4 }, () => review('fixes')), conflict];
  const step = decide({ issue: started, tree: tree({ commits: 1 }), pr: pr({ mergeable: 'CONFLICTING', reviews }) });
  assert.equal(step.agent, 'implementer');
  assert.match(step.reason, /base conflict/);
  for (const status of ['narrowed', 'replan']) assert.equal(decide({ issue: started, tree: tree({ commits: 1 }), pr: pr({ mergeable: 'CONFLICTING', reviews }), handBack: { status } }).agent, 'implementer', status);
});



test('an authoritative reviewer ref blocks dispatch before its label and recovers a dead child', () => {
  const base = { issue: started, tree: tree({ commits: 1 }), pr: pr() };
  assert.deepEqual(decide({ ...base, reviewSession: { oid: 'claim', dead: false } }), { wait: { pr: 5, until: 'reviewed' } });
  assert.deepEqual(decide({ ...base, reviewSession: { oid: 'claim', dead: true } }), { do: 'release-review', claim: 'claim' });
  assert.deepEqual(decide({ ...base, reviewSession: { unavailable: true } }), { wait: { pr: 5, until: 'reviewed' } });
});

test('scope replanning excludes base conflicts and conflict fixes tell the implementer to merge', () => {
  const brief = plannerBrief({ issue: started, pr: pr(), step: { mode: 'replan', reason: 'blocking findings' } });
  assert.match(brief, /Ignore base conflicts/);
  const fix = implementerBrief({ issue: started, tree: tree(), pr: pr(), step: { mode: 'fix', reason: 'conflicts with its base' }, base: 'main' });
  assert.match(fix, /git merge --no-ff --no-commit origin\/main/);
});

test('a base conflict takes priority over narrowed and replan hand-backs', () => {
  const base = { issue: started, tree: tree({ commits: 1 }), pr: pr({ mergeable: 'CONFLICTING', reviews: [review('fixes')] }) };
  for (const status of ['narrowed', 'replan']) {
    const step = decide({ ...base, handBack: { status } });
    assert.equal(step.agent, 'implementer', status);
    assert.match(step.reason, /conflicts with its base/);
  }
});

test('a live reviewer keeps its claim even if the worktree is dirty', () => {
  const claimed = pr({ labels: [label('risk:R1'), label('state:reviewing')] });
  const step = decide({ issue: started, tree: tree({ dirty: true }), pr: claimed, reviewSession: { oid: 'claim', dead: false } });
  assert.deepEqual(step, { wait: { pr: 5, until: 'reviewed' } });
});

test('a recorded review-post failure releases a leftover label after the atomic claim is gone', () => {
  const claimed = pr({ labels: [label('risk:R1'), label('state:reviewing')] });
  const base = { issue: started, tree: tree({ commits: 1 }), pr: claimed, reviewingSince: 100, postFailed: true };
  assert.deepEqual(decide(base), { do: 'release-review' });
  assert.deepEqual(decide({ ...base, reviewSession: { oid: 'live', dead: false } }), { wait: { pr: 5, until: 'reviewed' } });
  const retry = decide({ ...base, pr: pr({ reviews: [review('fixes')] }) });
  assert.equal(retry.agent, 'reviewer');
  assert.equal(retry.reason, 'the previous review post failed');
});

test('existing tagged conflict-only findings route to the base merge without hiding other findings', () => {
  const prior = Array.from({ length: 4 }, () => review('fixes'));
  const tagged = text => ({ ...review('fixes'), body: `<!-- agent-review sha=${head} round=5 verdict=fixes -->\n${text}` });
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const conflict = decide({ ...base, pr: pr({ mergeable: 'CONFLICTING', reviews: [...prior, tagged('**Important** The PR conflicts with the base branch.')] }) });
  assert.equal(conflict.agent, 'implementer');
  const mixed = decide({ ...base, pr: pr({ reviews: [...prior, tagged('**Important** The PR conflicts with the base branch.\n**Important** A user loses saved data.')] }) });
  assert.equal(mixed.agent, 'planner');
  const inconsistent = tagged('**Important** The PR conflicts with the base branch.\n**Important** A user loses saved data.');
  inconsistent.body = inconsistent.body.replace('verdict=fixes', 'verdict=fixes finding=base-conflict');
  assert.equal(decide({ ...base, pr: pr({ reviews: [...prior, inconsistent] }) }).agent, 'planner');
});

test('drive reads open inline findings before routing a conflict-only verdict', () => {
  const reviews = Array.from({ length: 5 }, () => review('fixes'));
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, reviews })] });
  const thread = (body, extra = {}) => ({ isResolved: false, comments: { nodes: [{ body, author: { login: 'reviewer' } }] }, ...extra });
  const conflict = thread('**Important** The PR conflicts with the base branch.');
  repo.io.reviewThreads = () => ({ nodes: [conflict], pageInfo: { hasNextPage: false } });
  repo.s.prs[0].mergeable = 'CONFLICTING';
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'implementer');
  repo.s.prs[0].mergeable = 'MERGEABLE';
  repo.io.reviewThreads = () => ({ nodes: [conflict, thread('**Important** Users lose saved data.')], pageInfo: { hasNextPage: false } });
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'planner');
  repo.io.reviewThreads = () => ({ nodes: [conflict], pageInfo: { hasNextPage: true } });
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'planner');
  repo.io.reviewThreads = () => { throw new Error('unavailable'); };
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'planner');
  repo.io.reviewThreads = () => null;
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'planner');
  repo.io.reviewThreads = () => ({ nodes: [conflict, thread('Unclassified reviewer finding')], pageInfo: { hasNextPage: false } });
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'planner');
  repo.io.reviewThreads = () => ({ nodes: [conflict, thread('**Important** Users lose saved data.', { isResolved: true })], pageInfo: { hasNextPage: false } });
  repo.s.prs[0].mergeable = 'CONFLICTING';
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'implementer');
  repo.s.prs[0].mergeable = 'MERGEABLE';
});

test('GitHub thread lookup reads reviewer findings and rejects incomplete responses', () => {
  const threads = { nodes: [{ isResolved: false, comments: { nodes: [{ body: '**Important** Base conflict', author: { login: 'reviewer' } }] } }], pageInfo: { hasNextPage: false } };
  const io = githubIo(lanes, args => {
    assert.equal(args[0], 'api');
    assert.ok(args.some(arg => arg.startsWith('query=') && arg.includes('reviewThreads')));
    assert.ok(args.includes('number=5'));
    return { data: { repository: { pullRequest: { reviewThreads: threads } } } };
  });
  assert.deepEqual(io.reviewThreads(pr()), threads);
  assert.throws(() => githubIo(lanes, () => ({})).reviewThreads(pr()), /Cannot read review threads/);
});

test('drive classifies all review-thread pages, including later mixed findings', () => {
  const reviews = Array.from({ length: 5 }, () => review('fixes'));
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, mergeable: 'CONFLICTING', reviews })] });
  const thread = (body, isResolved = false) => ({ isResolved, comments: { nodes: [{ body, author: { login: 'reviewer' } }] } });
  const resolved = Array.from({ length: 100 }, () => thread('**Important** Old finding', true));
  let mixed = false; const seen = [];
  const gh = args => {
    const after = args.find(arg => arg.startsWith('after='))?.slice(6) || null;
    seen.push(after);
    const page = after === null ? { nodes: resolved, pageInfo: { hasNextPage: true, endCursor: 'page-one' } }
      : { nodes: [thread('**Important** The PR conflicts with the base branch.'), ...(mixed ? [thread('**Important** Users lose data.')] : [])], pageInfo: { hasNextPage: false, endCursor: 'page-two' } };
    return { data: { repository: { pullRequest: { reviewThreads: page } } } };
  };
  repo.io.reviewThreads = githubIo(lanes, gh).reviewThreads;
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'implementer');
  assert.deepEqual(seen, [null, 'page-one']);
  mixed = true; seen.length = 0; repo.s.prs[0].mergeable = 'MERGEABLE';
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'planner');
  assert.deepEqual(seen, [null, 'page-one']);
});

test('thread pagination refuses missing, repeated, and failed later pages', () => {
  const page = endCursor => ({ data: { repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: true, endCursor } } } } } });
  assert.throws(() => githubIo(lanes, () => page(null)).reviewThreads(pr()), /Cannot paginate/);
  assert.throws(() => githubIo(lanes, () => page('same')).reviewThreads(pr()), /Cannot paginate/);
  let calls = 0;
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, reviews: Array.from({ length: 5 }, () => review('fixes')) })] });
  repo.io.reviewThreads = githubIo(lanes, () => { if (calls++) throw new Error('network'); return page('next'); }).reviewThreads;
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'planner');
  assert.equal(calls, 2);
});

test('check refuses a different intended worktree', t => {
  const other = mkdtempSync(join(tmpdir(), 'workflow-other-worktree-'));
  t.after(() => rmSync(other, { recursive: true, force: true }));
  assert.throws(() => checkCommand(['--worktree', other], { steps: { test: ['true'] } }, { root: process.cwd() }), /worktree/i);
});

test('drive returns an owner step for non-strict base checks', () => {
  const approved = { author: { login: 'reviewer' }, state: 'APPROVED', body: `<!-- agent-review sha=${head} round=1 verdict=ready -->`, commit: { oid: head } };
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, isDraft: false, reviews: [approved] })] });
  repo.io.strictPolicy = () => false;
  const result = drive(repo.io, 3, lanes, {});
  assert.match(result.owner, /up.to.date/);
  assert.match(result.url, /settings/);
  assert.ok(!repo.calls.some(c => c[0] === 'auto-merge'));
});

test('implementer hand-back requests individual changed files', () => {
 const brief = implementerBrief({ issue: started, tree: tree(), step: { mode: 'build' }, base: 'main' });
 assert.match(brief, /changed file paths only, not directories/);
});

test('project device locks cover the whole verification run', async t => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawn } = await import('node:child_process');
  const directory = mkdtempSync(join(tmpdir(), 'device-lock-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'log');
  const gate = `const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},'+\\n');setTimeout(()=>fs.appendFileSync(${JSON.stringify(log)},'-\\n'),200)`;
  const module = new URL('../../plugins/common/workflow/scripts/locks.mjs', import.meta.url).href;
  const script = `import {runWithLocks} from ${JSON.stringify(module)}; process.exitCode=runWithLocks(${JSON.stringify(directory)}, ['device-a'], process.execPath, ['-e', ${JSON.stringify(gate)}]).status;`;
  const runs = Array.from({length: 2}, () => new Promise(resolve => spawn(process.execPath, ['--input-type=module', '-e', script], {stdio: 'ignore'}).on('exit', resolve)));
  assert.deepEqual(await Promise.all(runs), [0, 0]);
  assert.equal(readFileSync(log, 'utf8'), '+\n-\n+\n-\n');
});

test('drive disables auto-merge before pushing an updated head', () => {
 const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1, unpushed: true }) }, prs: [pr({ issue: 3, autoMergeRequest: {} })] });
 drive(repo.io, 3, lanes, { status: 'done' });
 assert.deepEqual(repo.calls.filter(c => ['disable-auto-merge', 'push'].includes(c[0])), [['disable-auto-merge', 5], ['push']]);
});

test('check requires an intended worktree binding', () => {
 assert.throws(() => checkCommand([], lanes, { root: process.cwd() }), /worktree/i);
});

test('implementer check quotes worktree paths for the shell', async () => {
 const { spawnSync } = await import('node:child_process');
 const path = "/tmp/team workspace/owner's tree";
 const brief = implementerBrief({ issue: started, tree: tree({ path }), step: { mode: 'build' }, base: 'main' });
 const command = brief.match(/`node ([^`]+) check --worktree ([^`]+)`/);
 assert.ok(command);
 const result = spawnSync('sh', ['-c', `set -- ${command[2]}; printf '%s\\n' "$#" "$1"`], { encoding: 'utf8' });
 assert.equal(result.status, 0);
 assert.equal(result.stdout, `1\n${path}\n`);
});

test('custom responsibility invokes its configured host and returns its hand-back', async () => {
  const { runResponsibility } = await import('../../plugins/common/workflow/scripts/lib/responsibility.mjs');
  const calls = [];
  const delivery = { orchestrator: 'codex', roles: Object.fromEntries(['design', 'documentation', 'security'].map(role => [role, { host: role === 'design' ? 'claude' : 'codex', model: `${role}-model` }])) };
  for (const role of ['design', 'documentation', 'security']) {
    const output = runResponsibility(delivery, role, '/tmp/brief.md', (host, args) => { calls.push({ host, args }); return { status: 0, stdout: 'status: done\nnote: complete\n' }; });
    assert.match(output, /status: done/);
  }
  assert.deepEqual(calls.map(call => call.host), ['claude', 'codex', 'codex']);
  assert.ok(calls.every(call => call.args.join(' ').includes('/tmp/brief.md')));
  assert.deepEqual(calls.map(call => ['design', 'documentation', 'security'].find(role => call.args.at(-1).includes(`responsibility: ${role}`))), ['design', 'documentation', 'security']);
  assert.throws(() => runResponsibility(delivery, 'reviewer', '/tmp/brief.md', () => {}), /built-in/);
  assert.throws(() => runResponsibility(delivery, 'missing', '/tmp/brief.md', () => {}), /Configure/);
  assert.throws(() => runResponsibility(delivery, 'design', '/tmp/brief.md', () => ({ status: 0, stdout: 'oops' })), /hand-back/);
  for (const output of ['status: blocked\nnote: cannot read brief\nstatus: done\nnote: complete', 'Example:\nstatus: done\nnote: complete', 'status: done\nnote: complete\nextra: record', 'status: done\nnote: complete\nnote: revised']) {
    assert.throws(() => runResponsibility(delivery, 'design', '/tmp/brief.md', () => ({ status: 0, stdout: output })), /hand-back/);
  }
});


test('draft title prefers a conventional issue title and skips base merge commits', t => {
  const f = fixture(t);
  const commit = (repo, message) => run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-qm', message], { cwd: repo });
  assert.equal(commit(f.repo, 'feat(app): first change').status, 0);
  assert.equal(commit(f.main, 'base update').status, 0);
  assert.equal(f.linkedGit('update-ref', 'refs/remotes/origin/main', f.git('rev-parse', 'HEAD').stdout.trim()).status, 0);
  assert.equal(run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'merge', '--no-ff', '-qm', 'Merge base', 'origin/main'], { cwd: f.repo }).status, 0);
  const log = join(f.root, 'gh.log'); f.env.GH_LOG = log;
  writeFileSync(join(f.root, 'bin', 'gh'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$GH_LOG"\n[ "$1 $2" = 'pr view' ] && printf '{"number":5}\\n'\nexit 0\n`);
  const module = new URL('../../plugins/common/workflow/scripts/lib/drive.mjs', import.meta.url).href;
  const code = `import { githubIo } from ${JSON.stringify(module)}; const io = githubIo(${JSON.stringify(lanes)}, () => ({number:5})); const tree = io.tree(3, 'feature/test'); io.open({number:3,title:process.argv[1]}, tree, 'R1', {});`;
  for (const [title, expected] of [['fix(app): issue title', 'fix(app): issue title'], ['Plain issue', 'feat(app): first change']]) {
    const result = run(process.execPath, ['--input-type=module', '-e', code, title], { cwd: f.repo, env: f.env });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readFileSync(log, 'utf8').includes(`--title ${expected} --body-file`));
  }
});

test('AGY custom responsibility grants only the existing brief and validates its hand-back', async t => {
  const { runResponsibility } = await import('../../plugins/common/workflow/scripts/lib/responsibility.mjs');
  const { mkdtempSync, writeFileSync, rmSync, realpathSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'agy-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const brief = join(dir, 'a "quoted" brief.md');
  writeFileSync(brief, 'brief');
  const delivery = { orchestrator: 'codex', roles: { design: { host: 'agy', model: 'model' } }, executables: { agy: 'custom-agy' } };
  let invocation;
  const output = runResponsibility(delivery, 'design', brief, (host, args) => { invocation = { host, args }; return { status: 0, stdout: 'status: done\nnote: complete\n' }; });
  assert.equal(output, 'status: done\nnote: complete\n');
  assert.equal(invocation.host, 'custom-agy');
  assert.deepEqual(JSON.parse(invocation.args[invocation.args.indexOf('--settings') + 1]), { permissions: { allow: [`read_file(${realpathSync(brief)})`] } });
  assert.equal(invocation.args[invocation.args.indexOf('--model') + 1], 'model');
  assert.match(invocation.args.at(-1), /responsibility: design/);
  assert.throws(() => runResponsibility(delivery, 'design', join(dir, 'missing'), () => { throw Error('must not invoke'); }), /brief/i);
  assert.throws(() => runResponsibility(delivery, 'design', brief, () => ({ status: 1, stderr: 'unsupported model' })), /unsupported model/);
  assert.throws(() => runResponsibility(delivery, 'design', brief, () => ({ status: 0, stdout: 'bad' })), /malformed hand-back/);
});

test('AGY rejects permission metacharacters in brief paths', async t => {
  const { runResponsibility } = await import('../../plugins/common/workflow/scripts/lib/responsibility.mjs');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'agy-unsafe-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const delivery = { orchestrator: 'codex', roles: { design: { host: 'agy', model: 'm' } } };
  for (const char of ['*', '?', '[', ']', '{', '}', '\\', '(', ')']) {
    const brief = join(dir, `brief${char}.md`);
    writeFileSync(brief, 'brief');
    assert.throws(() => runResponsibility(delivery, 'design', brief, () => { throw Error('invoked'); }), /unsafe.*path/i);
  }
});

test('AGY native probe runs independently of other hosts', async t => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'agy-probe-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const executable = join(dir, 'agy');
  writeFileSync(executable, `#!${process.execPath}\nconst fs = require('fs'); const a = process.argv; const rule = JSON.parse(a[a.indexOf('--settings') + 1]).permissions.allow[0]; const brief = fs.readFileSync(rule.slice(10, -1), 'utf8'); const marker = brief.match(/and ([a-f0-9]+)\\./)[1]; process.stdout.write('status: done\\nnote: design ' + marker + '\\n');\n`);
  chmodSync(executable, 0o755);
  const probe = new URL('../probe-responsibilities.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [probe.pathname, '--agy', 'model'], { encoding: 'utf8', env: { ...process.env, PATH: dir } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^agy: brief and hand-back passed/);
});


test('ranked custom responsibilities skip only an executable that failed to start', async () => {
  const { runResponsibility } = await import('../../plugins/common/workflow/scripts/lib/responsibility.mjs');
  const delivery = { orchestrator: 'claude', roles: { design: [{ host: 'claude', model: 'sonnet' }, { host: 'codex', model: 'terra' }] } };
  const calls = [];
  const result = runResponsibility(delivery, 'design', '/tmp/brief', (host) => {
    calls.push(host);
    return host === 'claude' ? { error: Object.assign(new Error('missing'), { code: 'ENOENT' }) } : { status: 0, stdout: 'status: done\nnote: complete\n' };
  });
  assert.equal(result, 'status: done\nnote: complete\n');
  assert.deepEqual(calls, ['claude', 'codex']);
  for (const failure of [{ status: 1, stderr: 'quota exhausted' }, { status: 1, stderr: 'permission denied' }, { status: 0, stdout: 'ambiguous' }]) {
    const attempted = [];
    assert.throws(() => runResponsibility(delivery, 'design', '/tmp/brief', host => { attempted.push(host); return failure; }), /resum|hand-back/i);
    assert.deepEqual(attempted, ['claude']);
  }
});


test('ranked delivery reports choices and rejects unsupported handoffs', () => {
  const choices = [{ host: 'claude', model: 'sonnet' }, { host: 'codex', model: 'terra' }];
  const repo = fakeRepo({ issues: { 3: issue({ assessment: assessed('R1') }) } });
  const configured = { ...lanes, delivery: { orchestrator: 'claude', roles: { implementer: choices } } };
  const result = drive(repo.io, 3, configured, {});
  assert.deepEqual([result.host, result.model, result.alternatives], ['claude', 'sonnet', [choices[1]]]);
  assert.throws(() => deliveryAssignment({ orchestrator: 'codex', roles: { implementer: choices } }, { agent: 'implementer' }, 'R1'), /resume drive.*reorder/i);
  assert.throws(() => deliveryAssignment({ orchestrator: 'claude', roles: { planner: [{host: 'agy', model: 'x'}, choices[1]] } }, { agent: 'planner' }, 'R1'), /unverified.*reorder/i);
  assert.throws(() => deliveryAssignment({ orchestrator: 'claude', roles: { reviewer: [{host: 'agy', model: 'x'}, choices[1]] } }, { agent: 'reviewer' }, 'R1'), /advisory only/);
  assert.throws(() => deliveryAssignment({ orchestrator: 'claude', roles: { reviewer: [] } }, { agent: 'reviewer' }, 'R1'), /configure/i);
});

test('ranked custom responsibility reports exhaustion without invoking work', async () => {
  const { runResponsibility } = await import('../../plugins/common/workflow/scripts/lib/responsibility.mjs');
  const delivery = { orchestrator: 'claude', roles: { design: [{ host: 'claude', model: 'a' }, { host: 'codex', model: 'b' }] } };
  const calls = [];
  assert.throws(() => runResponsibility(delivery, 'design', '/tmp/brief', host => { calls.push(host); return { error: Object.assign(new Error('missing'), { code: 'ENOENT' }) }; }), /all configured candidates unavailable/i);
  assert.deepEqual(calls, ['claude', 'codex']);
});

test('review: a later round judges the delta, round 1 the whole diff, and a review without a whole-diff verdict the whole diff', () => {
  const brief = (round, extra = {}) => reviewerBrief({ repo: 'acme/app', pr: pr(), issue: issue(), risk: 'R1', step: { mode: 'review', round, ...extra }, lanes, base: 'main' });
  const first = brief(1);
  assert.doesNotMatch(first, /Later round/);
  const later = brief(2);
  assert.match(later, /Later round: judge only the delta `review-context` returns as `comparison`, your open threads and the criteria/);
  assert.match(later, /no earlier verdict of yours reviewed the whole diff.*whole diff at head/);
  assert.doesNotMatch(later, /judge the whole diff and use/);
});

test('the Reviewer runs Opus at R0, R1 and R2 without delivery configuration; implementer models by risk are unchanged', () => {
  for (const risk of ['R0', 'R1', 'R2']) {
    assert.equal(modelForStep({ agent: 'reviewer' }, risk), 'opus');
    assert.deepEqual(deliveryAssignment(undefined, { agent: 'reviewer', mode: 'approve' }, risk), { host: 'claude', model: 'opus', effort: 'medium', session: 'separate' });
  }
  assert.deepEqual(['R0', 'R1', 'R2'].map(risk => modelForStep({ agent: 'implementer' }, risk)), ['sonnet', 'sonnet', 'opus']);
});

test('configuration refuses AGY as reviewer, implementer or fresh implementer and names the advisory roles it may take', () => {
  const choice = { host: 'agy', model: 'm' }; const other = { host: 'claude', model: 'opus' };
  for (const [role, step] of [['reviewer', { agent: 'reviewer' }], ['implementer', { agent: 'implementer' }], ['freshImplementer', { agent: 'implementer', fresh: true }]]) {
    for (const configured of [choice, [other, choice]]) {
      assert.throws(() => deliveryAssignment({ orchestrator: 'claude', roles: { [role]: configured } }, step, 'R1'), error => error.message.includes(`delivery.roles.${role}`) && /advisory only/.test(error.message) && /devops risk second opinion, the improver or a custom responsibility/.test(error.message));
    }
  }
  assert.deepEqual(deliveryAssignment({ orchestrator: 'claude', roles: { devops: choice } }, { agent: 'devops' }, 'R1'), { host: 'agy', model: 'm', effort: 'medium', session: 'native' });
  const refused = { ...lanes, delivery: { orchestrator: 'claude', roles: { reviewer: choice, implementer: other } } };
  assert.throws(() => drive(fakeRepo({ issues: { 3: issue({ assessment: assessed('R1') }) } }).io, 3, refused, {}), /advisory only/, 'drive stops before dispatching any role');
});

test('scope: a diff path no scope.paths entry covers returns the implementer instead of opening the PR', () => {
  const scoped = issue({ labels: [label('state:started')], body: '```scope\n{"paths":["src/feature/","docs/a.md"]}\n```', assessment: assessed() });
  const done = { status: 'done', commit: 'feat(app): x', paths: ['src/feature/a.js'] };
  const inScope = tree({ commits: 1, diffPaths: ['src/feature/a.js', 'src/feature/deep/b.js', 'docs/a.md'] });
  assert.deepEqual(decide({ issue: scoped, tree: inScope, handBack: done }), { do: 'open' }, 'a trailing slash covers its subtree');
  const stray = decide({ issue: scoped, tree: tree({ commits: 1, unpushed: true, diffPaths: ['src/feature/a.js', 'src/featurex/b.js', 'plugins/c.js'] }), handBack: done });
  assert.deepEqual([stray.agent, stray.mode, stray.outOfScope, stray.resume], ['implementer', 'build', ['src/featurex/b.js', 'plugins/c.js'], true]);
  assert.match(stray.reason, /outside the issue's scope: src\/featurex\/b\.js, plugins\/c\.js/);
  assert.match(implementerBrief({ issue: scoped, risk: 'R1', model: 'sonnet', base: 'main', tree: tree(), pr: null, step: stray, round: 0 }), /Revert each of these paths.*hand back `replan`/);
});

test('scope: an issue without a packet and a fix inside the scope are unaffected, and an out-of-scope fix is held before it is pushed', () => {
  const free = issue({ labels: [label('state:started')], body: 'no packet', assessment: assessed() });
  const done = { status: 'done', commit: 'feat(app): x', paths: ['a'] };
  assert.deepEqual(decide({ issue: free, tree: tree({ commits: 1, diffPaths: ['anywhere/x.js'] }), handBack: done }), { do: 'open' });
  const scoped = issue({ labels: [label('state:started')], body: '```scope\n{"paths":["src/"]}\n```', assessment: assessed() });
  const fixing = (diffPaths, extra = {}) => decide({ issue: scoped, tree: tree({ commits: 2, unpushed: true, diffPaths, ...extra }), pr: pr({ reviews: [review('fixes')] }), handBack: done });
  assert.deepEqual(fixing(['src/a.js']), { do: 'push' });
  const held = fixing(['src/a.js', 'docs/z.md']);
  assert.deepEqual([held.agent, held.mode, held.outOfScope], ['implementer', 'fix', ['docs/z.md']]);
  const pushed = decide({ issue: scoped, tree: tree({ commits: 2, diffPaths: ['src/a.js', 'docs/z.md'] }), pr: pr({ reviews: [review('fixes')] }), handBack: done });
  assert.deepEqual([pushed.agent, pushed.mode], ['implementer', 'fix'], 'a clean done fix is held for scope before another review');
  assert.equal(decide({ issue: scoped, tree: tree({ commits: 2, diffPaths: ['docs/z.md'] }), pr: pr({ reviews: [review('fixes')] }) }).outOfScope, undefined, 'only a done hand-back is checked');
});

// ---- #571: the planner consolidates overlapping unstarted issues before drive starts one.

const scoped = (n, paths, extra = {}) => issue({ number: n, url: `https://github.com/acme/app/issues/${n}`, body: `\`\`\`scope\n${JSON.stringify({ paths })}\n\`\`\``, assessment: assessed('R0'), ...extra });
const facts = (over = {}) => ({ parentOf: () => null, hasPr: () => false, blockedBy: () => [], ...over });

test('overlap: same epic and overlapping scope paths are found, in number order', () => {
  const me = scoped(3, ['src/a/']);
  const others = [scoped(9, ['src/a/b.js']), scoped(5, ['src/']), scoped(7, ['docs/']), scoped(8, ['src/ab/'])];
  assert.deepEqual(findOverlaps(me, others, facts()), [5, 9], 'a subtree overlaps its parent or child path; a sibling prefix does not');
  assert.deepEqual(findOverlaps(me, others, facts({ parentOf: n => (n === 3 || n === 5 ? 20 : n === 9 ? 20 : 30) })), [5, 9], 'the same epic overlaps');
  assert.deepEqual(findOverlaps(issue({ number: 3, body: 'no packet' }), others, facts()), [], 'an issue with no scope packet cannot be compared');
});

test('overlap: started, owner-lane, epic, PR-backed, other-epic, dependent and distinct issues are never merged', () => {
  const me = scoped(3, ['src/']);
  const found = others => findOverlaps(me, others, facts());
  assert.deepEqual(found([scoped(4, ['src/'], { labels: [label('state:started')] })]), [], 'started');
  assert.deepEqual(found([scoped(4, ['src/'], { labels: [label('lane:owner')] })]), [], 'lane:owner');
  assert.deepEqual(found([scoped(4, ['src/'], { labels: [label('type:epic')] })]), [], 'an epic');
  assert.deepEqual(findOverlaps(scoped(3, ['src/'], { labels: [label('lane:owner')] }), [scoped(4, ['src/'])], facts()), [], 'the issue itself under lane:owner');
  assert.deepEqual(findOverlaps(me, [scoped(4, ['src/'])], facts({ hasPr: n => n === 4 })), [], 'an open PR');
  assert.deepEqual(findOverlaps(me, [scoped(4, ['src/'])], facts({ parentOf: n => (n === 4 ? 20 : null) })), [], 'a different epic, or an epic and a standalone issue');
  assert.deepEqual(findOverlaps(me, [scoped(4, ['src/'])], facts({ parentOf: n => (n === 4 ? 20 : 21) })), [], 'two different epics');
  assert.deepEqual(findOverlaps(me, [scoped(4, ['src/'])], facts({ blockedBy: n => (n === 4 ? [3] : []) })), [], 'a blocked-by link');
  assert.deepEqual(findOverlaps(scoped(3, ['src/'], { body: '```scope\n{"paths":["src/"],"dependencies":[4]}\n```' }), [scoped(4, ['src/'])], facts()), [], 'a packet dependency');
  assert.deepEqual(findOverlaps(me, [scoped(4, ['src/'], { body: `${scoped(4, ['src/']).body}\n${distinctMarker(3)}` })], facts()), [], 'marked distinct by the other');
  assert.deepEqual(findOverlaps({ ...me, body: `${me.body}\n${distinctMarker(4)}` }, [scoped(4, ['src/'])], facts()), [], 'marked distinct by the planner on this issue');
  assert.deepEqual(found([scoped(4, ['src/'], { body: 'no packet' })]), [], 'an issue with no packet');
});

test('drive sends an overlapping unstarted issue to the planner, starting nothing', () => {
  const repo = fakeRepo({ issues: { 3: scoped(3, ['src/']), 4: scoped(4, ['src/a.js']) } });
  repo.io.overlaps = i => findOverlaps(i, repo.io.openIssues(), facts());
  const step = drive(repo.io, 3, lanes, {});
  assert.deepEqual([step.agent, step.mode, step.model, step.issue, step.overlaps], ['planner', 'consolidate', 'opus', 3, undefined]);
  assert.match(step.reason, /#4 overlaps the scope and epic of #3/);
  assert.deepEqual(repo.calls, [], 'no claim, no worktree');
  const brief = repo.writes[step.brief];
  assert.match(brief, /Merge the overlapping unstarted issues #4 and #3 into one canonical issue/);
  assert.match(brief, /every outcome, criterion, dependency, decision and milestone/);
  assert.match(brief, /consolidated-into N/);
  assert.match(brief, /never by size/);
  assert.match(brief, /Never merge a started issue.*different epics without a shared outcome.*lane:owner/);
  assert.doesNotMatch(brief, /Agree each slice with the owner/);
});

test('drive never asks the planner about an issue whose PR is open, even without state:started', () => {
  const repo = fakeRepo({ issues: { 3: scoped(3, ['src/']), 4: scoped(4, ['src/a.js']) }, prs: [pr({ issue: 3, reviews: [review('fixes')] })] });
  let asked = 0;
  repo.io.overlaps = i => { asked++; return findOverlaps(i, repo.io.openIssues(), facts()); };
  const step = drive(repo.io, 3, lanes, {});
  assert.equal(asked, 0, 'the planner is never consulted for an open-PR issue');
  assert.notEqual(step.agent, 'planner');
});

test('drive starts an issue once no overlap is left, and reports what the planner merged', () => {
  const repo = fakeRepo({ issues: { 3: scoped(3, ['src/']), 4: scoped(4, ['src/a.js']) } });
  repo.io.overlaps = i => findOverlaps(i, repo.io.openIssues(), facts());
  repo.s.issues[4].state = 'CLOSED';
  const done = drive(repo.io, 3, lanes, parseHandBack('status: consolidated\ninto: 3\nclosed: 4\nnote: folded the doc criteria in'));
  assert.deepEqual(done.consolidated, { into: 3, closed: [4], note: 'folded the doc criteria in' });
  assert.equal(done.agent, 'implementer');
  assert.deepEqual(repo.calls, [['start', 3]]);
});

test('drive follows a driven issue the planner closed to its canonical issue', () => {
  const repo = fakeRepo({ issues: { 3: scoped(3, ['src/'], { state: 'CLOSED' }), 4: scoped(4, ['src/']) } });
  repo.io.overlaps = i => findOverlaps(i, repo.io.openIssues(), facts());
  const result = drive(repo.io, 3, lanes, { status: 'consolidated', into: '#4', closed: '#3' });
  assert.deepEqual([result.agent, result.issue, result.consolidated.into, result.consolidated.closed], ['implementer', 4, 4, [3]]);
});

test('drive refuses a consolidation report GitHub does not back', () => {
  const repo = fakeRepo({ issues: { 3: scoped(3, ['src/']), 4: scoped(4, ['src/a.js']) } });
  repo.io.overlaps = i => findOverlaps(i, repo.io.openIssues(), facts());
  const unbacked = drive(repo.io, 3, lanes, { status: 'consolidated', into: '3', closed: '4' });
  assert.match(unbacked.blocked.reason, /#4 stay open/);
  assert.deepEqual(repo.calls, []);
  const persists = drive(repo.io, 3, lanes, { status: 'distinct' });
  assert.match(persists.blocked.reason, /handed back distinct, yet #4 still overlaps it/);
  assert.deepEqual(consolidationReport({ into: '#12', closed: '#5, #6' }), { into: 12, closed: [5, 6] });
});

test('githubIo reads the epic and open PR of only the issues whose scope overlaps', () => {
  const asked = [];
  const open = [scoped(3, ['src/']), scoped(4, ['src/a.js']), scoped(5, ['docs/'])].map(({ number, labels, body }) => ({ number, labels, body }));
  const gh = args => {
    asked.push(args.join(' '));
    if (args[0] === 'issue' && args[1] === 'list') return open;
    if (args[0] === 'pr' && args[1] === 'list') return [];
    if (args.some(arg => arg.endsWith('/parent'))) return { number: 20 };
    if (args.some(arg => arg.includes('/dependencies/blocked_by'))) return [[]];
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const io = githubIo({ repo: 'acme/app', base: 'main' }, gh);
  assert.deepEqual(io.overlaps(open[0]), [4]);
  assert.equal(asked.some(call => /issues\/5\//.test(call)), false, 'the docs-only issue is never read');
});

test('a dependency on an issue closed as consolidated follows its target, never an owner step', () => {
  const read = (targetState, extra = {}) => args => {
    const [kind, path] = args;
    if (path?.endsWith('/dependencies/blocked_by')) return [{ number: 422 }, { number: 560 }];
    if (path === 'repos/acme/app/issues/422') return { state: 'closed', state_reason: 'not_planned', labels: [], body: 'old\n<!-- workflow:consolidated-into 560 -->' };
    if (path === 'repos/acme/app/issues/560') return { state: targetState, state_reason: 'completed', labels: [], body: '```scope\n{"paths":["a/"]}\n```', ...extra };
    if (args[1] === 'graphql') return { data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [{ merged: true }] } } } } };
    throw new Error(`unexpected ${args.join(' ')} ${kind}`);
  };
  assert.deepEqual(splitDependencies(readDependencies('acme/app', { number: 551, body: '' }, read('open'))), { blockers: [560], dropped: [] }, 'waits on the target, once');
  assert.deepEqual(splitDependencies(readDependencies('acme/app', { number: 551, body: '' }, read('closed'))), { blockers: [], dropped: [] }, 'met when the target merged');
  const dropped = args => (args[1]?.endsWith('/dependencies/blocked_by') ? [{ number: 422 }] : { state: 'closed', state_reason: 'not_planned', labels: [], body: 'no marker' });
  assert.deepEqual(splitDependencies(readDependencies('acme/app', { number: 551, body: '' }, dropped)), { blockers: [], dropped: [422] }, 'closed as not planned with no consolidation target is still dropped');
  const itself = args => (args[1]?.endsWith('/dependencies/blocked_by') ? [{ number: 422 }] : { state: 'closed', state_reason: 'not_planned', labels: [], body: '<!-- workflow:consolidated-into 551 -->' });
  assert.deepEqual(readDependencies('acme/app', { number: 551, body: '' }, itself), [], 'a dependency folded into the issue itself disappears');
});

test('an epic counts a slice the planner folded into another by the target\'s delivery', () => {
  const epic = issue({ number: 9, title: 'epic', labels: [label('type:epic')] });
  const folded = issue({ number: 10, state: 'CLOSED', body: '<!-- workflow:consolidated-into 11 -->' });
  const repo = fakeRepo({ issues: { 9: epic, 10: folded, 11: issue({ number: 11, state: 'CLOSED' }) }, subs: { 9: [10, 11] }, merged: [11], lessons: [9] });
  drive(repo.io, 9, lanes, {});
  repo.s.issues[99].state = 'CLOSED';
  repo.s.merged = [11, 99];
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
  repo.s.merged = [99]; repo.s.issues[9].state = 'OPEN';
  assert.match(drive(repo.io, 9, lanes, {}).owner, /missing closing PR merged into main for #11/, 'the folded slice stands for its target, which has no merged PR');
});

test('the planner agent is defined, planner brief follows the epic outcome and the final refinement assesses delivery flow', () => {
  const agentText = readFileSync(new URL('../../plugins/common/workflow/agents/planner.md', import.meta.url), 'utf8');
  assert.match(agentText, /^name: planner$/m);
  assert.doesNotMatch(agentText.split('---')[1], /^model:/m);
  assert.match(agentText, /Never write code.*never start another agent/s);
  assert.match(agentText, /Split only for an independent outcome.*never by size/);
  assert.match(plannerBrief({ issue: issue(), step: { mode: 'slice' } }), /Slices follow the epic's approved outcome/);
  const sliceBrief = plannerBrief({ issue: issue(), step: { mode: 'slice' } });
  assert.match(sliceBrief, /issue create --title T --body-file PATH \[--milestone NAME\] \[--parent N\] \[--blocked-by N,M\]/);
  assert.match(sliceBrief, /issue comment --number N/);
  assert.doesNotMatch(sliceBrief, /`gh api`/);
});

test('epic repair skips a sub-issue closed as duplicate or not planned and ignores a link to it', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const closed = { state: 'CLOSED' };
  const repo = fakeRepo({
    issues: {
      9: epic, 10: issue({ number: 10 }),
      11: issue({ number: 11, ...closed, stateReason: 'NOT_PLANNED' }),
      12: issue({ number: 12, ...closed, body: '<!-- workflow:consolidated-into 10 -->' }),
      13: issue({ number: 13, ...closed }),
    },
    subs: { 9: [10, 11, 12] },
  });
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 10);
  assert.deepEqual(repo.calls.filter(call => call[0] === 'blocker'), [['blocker', 99, 10]], 'neither closed duplicate nor not-planned slice becomes a blocker');
  // An existing link to the retired slices no longer yields the owner step.
  repo.s.deps = { 99: [11, 12].map(number => ({ number, kind: 'issue', state: 'CLOSED', reason: 'not_planned', merged: false })) };
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 10);
  // A closed slice with neither marker nor reason and no merged change still yields it.
  repo.s.subs[9].push(13);
  repo.s.issues[10].state = 'CLOSED';
  repo.s.merged = [10];
  assert.match(drive(repo.io, 9, lanes, {}).owner, /#13/);
});

test('epic with an unticked criterion no slice references dispatches the planner before the refinement', () => {
  const body = '## Outcome\nx\n\n### Acceptance criteria\n- [x] Done thing <!-- workflow:criterion done-thing -->\n- [ ] Benchmark the parser <!-- workflow:criterion benchmark-the-parser -->\n- [ ] Measure memory use\n';
  const epic = issue({ number: 9, body, labels: [label('type:epic')] });
  const refinement = issue({ number: 99, body: '<!-- workflow:epic-refinement -->' });
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10, body: 'Delivers Measure memory use' }), 99: refinement }, subs: { 9: [10, 99] } });
  const step = drive(repo.io, 9, lanes, {});
  assert.deepEqual([step.agent, step.mode], ['planner', 'slice']);
  assert.match(repo.writes[step.brief], /benchmark-the-parser/);
  assert.doesNotMatch(repo.writes[step.brief], /`done-thing`/);
  assert.deepEqual(repo.calls, [], 'nothing is linked or built first');
  // The refinement itself never covers a criterion; once a slice cites the ID, behaviour is unchanged.
  repo.s.issues[10].body += '\nbenchmark-the-parser';
  assert.equal(drive(repo.io, 9, lanes, {}).issue, 10);
  assert.deepEqual(decideEpic({ epic: issue({ number: 9, body }), slices: [{ number: 99, state: 'OPEN', blockers: [], body: '<!-- workflow:epic-refinement -->\nBenchmark the parser Measure memory use' }, { number: 10, state: 'OPEN', blockers: [], body: 'x' }] }).uncovered.map(c => c.id), ['benchmark-the-parser', null]);
});

const agents = ['implementer', 'reviewer', 'devops', 'planner', 'improver'];
test('one role x risk x round table names model and effort; no cell ever yields xhigh or max', () => {
  for (const agent of agents) for (const risk of ['R0', 'R1', 'R2']) for (const round of [0, 1, 2, 3, 4, 5]) for (const fresh of [false, true]) {
    const cell = sessionFor(agent, risk, { round, fresh });
    assert.ok(['sonnet', 'opus'].includes(cell.model), `${agent} ${risk} r${round}`);
    assert.ok(['low', 'medium', 'high'].includes(cell.effort), `${agent} ${risk} r${round} effort ${cell.effort}`);
  }
  assert.deepEqual(['R0', 'R1', 'R2'].map(risk => sessionFor('implementer', risk).effort), ['low', 'medium', 'high']);
  assert.deepEqual(['R0', 'R1', 'R2'].map(risk => sessionFor('reviewer', risk)), [{ model: 'opus', effort: 'medium' }, { model: 'opus', effort: 'medium' }, { model: 'opus', effort: 'medium' }]);
  for (const risk of ['R0', 'R1', 'R2']) for (const agent of ['devops', 'planner', 'improver']) assert.equal(sessionFor(agent, risk).effort, 'medium');
  assert.deepEqual(['R0', 'R1', 'R2'].map(risk => sessionFor('implementer', risk).model), ['sonnet', 'sonnet', 'opus']);
  assert.equal(sessionFor('devops', 'R2').model, 'sonnet');
  assert.equal(sessionFor('planner', 'R0').model, 'opus');
});

test('a failing fix round raises the implementer one effort step before the fresh round moves up one model at medium', () => {
  const walk = risk => [1, 2, 3].map(round => sessionFor('implementer', risk, { round, fresh: round === 3 }));
  assert.deepEqual(walk('R0'), [{ model: 'sonnet', effort: 'low' }, { model: 'sonnet', effort: 'medium' }, { model: 'opus', effort: 'medium' }]);
  assert.deepEqual(walk('R1'), [{ model: 'sonnet', effort: 'medium' }, { model: 'sonnet', effort: 'high' }, { model: 'opus', effort: 'medium' }]);
  assert.deepEqual(walk('R2'), [{ model: 'opus', effort: 'high' }, { model: 'opus', effort: 'high' }, { model: 'opus', effort: 'medium' }]);
});

test('drive names effort in the instruction and the brief, and the Reviewer command carries it', () => {
  const repo = fakeRepo({ issues: { 3: issue({ labels: [label('risk:R2')], assessment: assessed('R2') }) } });
  const build = drive(repo.io, 3, lanes, {});
  assert.deepEqual([build.model, build.effort], ['opus', 'high']);
  assert.match(repo.writes[build.brief], /Model opus\. Effort high\./);
  repo.s.trees[3].dirty = true;
  drive(repo.io, 3, lanes, { status: 'done', commit: 'feat(a): b', paths: ['a'] });
  const reviewer = drive(repo.io, 3, lanes, { risk: 'R2', reason: 'a gate' });
  assert.equal(reviewer.effort, 'medium');
  assert.deepEqual(reviewer.command.slice(reviewer.command.indexOf('--model'), reviewer.command.indexOf('--model') + 4), ['--model', 'opus', '--effort', 'medium']);
  assert.equal(reviewerCommand('opus', '/b.md', 'n', 'codex', 'codex', 'high').includes('model_reasoning_effort="high"'), true);
});

test('fix rounds escalate effort in the instruction: R1 round 2 runs high', () => {
  const two = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, reviews: [review('fixes'), review('fixes')] })] });
  const step = drive(two.io, 3, lanes, {});
  assert.deepEqual([step.mode, step.model, step.effort, step.resume], ['fix', 'sonnet', 'high', true]);
});

test('a resumed implementer keeps its model; a risk raise that names another model starts a fresh session from a handoff brief', () => {
  const brief = '/repo/.worktrees/3-add-a-thing/.wf/drive-3-implementer.md';
  const open = (risk, reviews) => fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, labels: [label(`risk:${risk}`)], assessment: assessed(risk), reviews })] });
  const same = open('R1', [review('fixes')]);
  same.writes[brief] = '# Implementer brief\n\nMode: build. Risk R1. Model sonnet. Effort medium.\n';
  const kept = drive(same.io, 3, lanes, {});
  assert.deepEqual([kept.resume, kept.model, kept.handoff], [true, 'sonnet', undefined]);
  const raised = open('R2', [review('fixes')]);
  raised.writes[brief] = '# Implementer brief\n\nMode: build. Risk R1. Model sonnet. Effort medium.\n';
  const fresh = drive(raised.io, 3, lanes, {});
  assert.deepEqual([fresh.resume, fresh.model, fresh.effort, fresh.handoff], [undefined, 'opus', 'high', true]);
  assert.match(raised.writes[brief], /Handoff: .*open findings.*branch.*last hand-back/s);
  assert.match(raised.writes[brief], /Model opus\. Effort high\./);
});

test('agent definitions do not pin an effort: drive names it per session from the table', () => {
  for (const agent of agents) {
    const text = readFileSync(new URL(`../../plugins/common/workflow/agents/${agent}.md`, import.meta.url), 'utf8');
    assert.doesNotMatch(text.split('---')[1], /^effort:/m, agent);
  }
});

test('the production io reads the brief a role was last started with, so the handoff check runs outside the fake', t => {
  const f = fixture(t);
  const path = join(f.repo, 'brief.md');
  const io = githubIo(lanes, () => ({}));
  assert.equal(io.read(path), null, 'no brief yet');
  writeFileSync(path, 'Mode: build. Risk R1. Model sonnet. Effort medium.\n');
  assert.match(io.read(path), /Model sonnet\. Effort medium\./);
});

test('a resumed session that started fresh on a stronger model keeps it when the risk did not change', () => {
  const brief = '/repo/.worktrees/3-add-a-thing/.wf/drive-3-implementer.md';
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, labels: [label('risk:R1')], assessment: assessed('R1'), reviews: [review('fixes')] })] });
  repo.writes[brief] = '# Implementer brief\n\nMode: fix (round 3: the whole open set, fresh). Risk R1. Model opus. Effort medium.\n';
  const step = drive(repo.io, 3, lanes, {});
  assert.deepEqual([step.resume, step.handoff, step.model], [true, undefined, 'opus'], 'same risk: no handoff, the session keeps opus');
  assert.match(repo.writes[brief], /Model opus\. Effort /);
});

test('the documented drive session launches on Sonnet at low effort', () => {
  assert.deepEqual(driveSession, { model: 'sonnet', effort: 'low' });
  const command = driveSessionCommand('<issue|epic>');
  assert.equal(command, 'claude --model sonnet --effort low "/deliver drive <issue|epic>"');
  const read = doc => readFileSync(new URL(`../../${doc}`, import.meta.url), 'utf8');
  assert.ok(read('docs/CONCEPTS.md').includes(command));
  assert.ok(read('plugins/common/workflow/skills/deliver/references/setup.md').includes('Start it on Sonnet at low effort'));
});

// #622: no needless or unseen owner steps.
const baseConflictReview = extra => ({ ...review('fixes'), body: `<!-- agent-review sha=${head} round=2 verdict=fixes -->\n${extra}` });
const conflictFinding = '**Important** The PR conflicts with the base branch.';

test('a stale base conflict on a MERGEABLE PR returns the Reviewer for the same head, once', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const once = decide({ ...base, pr: pr({ reviews: [baseConflictReview(conflictFinding)] }) });
  assert.deepEqual([once.agent, once.mode, once.sameHead], ['reviewer', 'review', true]);
  const blocked = decide({ ...base, pr: pr({ reviews: [baseConflictReview(conflictFinding)] }), handBack: { status: 'blocked', note: 'origin/main is already merged' } });
  assert.equal(blocked.agent, 'reviewer', 'the implementer found nothing to merge, so no owner step');
  const twice = decide({ ...base, pr: pr({ reviews: [baseConflictReview(conflictFinding), baseConflictReview(conflictFinding)] }) });
  assert.equal(twice.agent, 'implementer', 'a second stale verdict at the same head stops as before');
  const twiceBlocked = decide({ ...base, pr: pr({ reviews: [baseConflictReview(conflictFinding), baseConflictReview(conflictFinding)] }), handBack: { status: 'blocked', note: 'nothing to merge' } });
  assert.match(twiceBlocked.owner, /nothing to merge/);
});

test('a conflicting PR still gets the implementer, and another open Important finding is never called a conflict', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const conflicting = decide({ ...base, pr: pr({ mergeable: 'CONFLICTING', reviews: [baseConflictReview(conflictFinding)] }) });
  assert.equal(conflicting.agent, 'implementer');
  const mixed = decide({ ...base, pr: pr({ reviews: [baseConflictReview(`${conflictFinding}\n**Important** drive.mjs:809 reads the wrong field.`)] }) });
  assert.equal(mixed.agent, 'implementer');
  assert.doesNotMatch(mixed.reason, /only/);
  const codeFinding = decide({ ...base, pr: pr({ reviews: [baseConflictReview('**Important** drive.mjs:809-810 mishandles a base conflict.')] }) });
  assert.doesNotMatch(codeFinding.reason, /only/);
  assert.notEqual(codeFinding.agent, 'reviewer');
});

test('a thread with another open Important finding keeps a MERGEABLE conflict verdict off the Reviewer', () => {
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, reviews: [baseConflictReview(conflictFinding)] })] });
  const thread = body => ({ isResolved: false, comments: { nodes: [{ body, author: { login: 'reviewer' } }] } });
  repo.io.reviewThreads = () => ({ nodes: [thread(conflictFinding)], pageInfo: { hasNextPage: false } });
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'reviewer');
  repo.io.reviewThreads = () => ({ nodes: [thread(conflictFinding), thread('**Important** Users lose saved data.')], pageInfo: { hasNextPage: false } });
  const step = drive(repo.io, 3, lanes, {});
  assert.notEqual(step.agent, 'reviewer');
  assert.doesNotMatch(step.reason || '', /only/);
});

test('an owner step is recorded on the issue and an owner step beside ready slices says to drive them', () => {
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) } });
  const recorded = [];
  repo.io.notifyOwner = (n, step) => recorded.push([n, step.owner, step.url]);
  const result = drive(repo.io, 3, lanes, { status: 'blocked', note: 'needs a credential' });
  assert.deepEqual(recorded, [[3, '#3: needs a credential', undefined]]);
  assert.match(result.owner, /credential/);
  repo.io.notifyOwner = () => { throw new Error('gh down'); };
  assert.match(drive(repo.io, 3, lanes, { status: 'blocked', note: 'x' }).owner, /x/, 'a failed comment never changes the step');
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const approved = { author: { login: 'reviewer' }, state: 'APPROVED', body: `<!-- agent-review sha=${head} round=1 verdict=ready -->`, commit: { oid: head } };
  const slice = n => issue({ number: n, labels: [label('state:started'), label('risk:R1')], assessment: assessed() });
  const slices = fakeRepo({ issues: { 9: epic, 10: slice(10), 12: slice(12) }, subs: { 9: [10, 12] }, trees: { 10: tree({ commits: 1 }), 12: tree({ commits: 1 }) }, prs: [pr({ issue: 10, number: 60, isDraft: false, reviews: [approved] })] });
  slices.io.strictPolicy = () => false;
  const notes = [];
  slices.io.notifyOwner = n => notes.push(n);
  const next = drive(slices.io, 9, lanes, {});
  assert.match(next.owner, /up.to.date/);
  assert.deepEqual(notes, [9]);
  assert.deepEqual(next.alsoReady, [12]);
  assert.match(next.continue, /drive each alsoReady slice/);
});

test('a drive session holds its claim between calls, is never raced, and is taken over once idle', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  try {
    const key = 'acme/app-620'; const window = 30 * 60_000;
    assert.equal(acquireRunLock({ directory, key, session: 'A', now: 1000 }).acquired, true);
    const again = acquireRunLock({ directory, key, session: 'A', now: 1000 + window - 1, progressMs: window });
    assert.equal(again.acquired, true, 'the same session refreshes its heartbeat');
    again.record('progress', 1000 + window - 1);
    const raced = acquireRunLock({ directory, key, session: 'B', now: 2000 + window - 2, progressMs: window });
    assert.deepEqual([raced.acquired, raced.by.session], [false, 'A'], 'a recent heartbeat is never raced, even with no process alive');
    const idle = acquireRunLock({ directory, key, session: 'B', now: 1000 + 2 * window });
    assert.deepEqual([idle.acquired, idle.tookOver.session], [true, 'A'], 'an idle session is taken over');
    idle.release();
    assert.equal(acquireRunLock({ directory, key, session: 'C', now: 1100 + 2 * window }).acquired, true, 'a released claim is free');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a claim whose holder only heartbeats is orphaned; a progressing holder is refused; the old holder stops', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  try {
    const key = 'acme/app-639'; const win = 10 * 60_000;
    const a = acquireRunLock({ directory, key, session: 'A', now: 0 });
    a.record('step-1', 0);
    for (const t of [win / 2, win - 1]) acquireRunLock({ directory, key, session: 'A', now: t }).record('step-1', t);
    const live = acquireRunLock({ directory, key, session: 'B', now: win - 1 });
    assert.deepEqual([live.acquired, live.by.session], [false, 'A'], 'a holder inside the progress window is refused');
    assert.equal(live.takeOverAt, win, 'the refusal says when it may be taken over');
    acquireRunLock({ directory, key, session: 'A', now: win + 10 }).record('step-2', win + 10);
    assert.equal(acquireRunLock({ directory, key, session: 'B', now: win + 20 }).acquired, false, 'a changed answer is progress');
    const hb = 3 * win;
    acquireRunLock({ directory, key, session: 'A', now: hb - 1 }).record('step-2', hb - 1);
    const taken = acquireRunLock({ directory, key, session: 'B', now: hb + win });
    assert.deepEqual([taken.acquired, taken.tookOver.session], [true, 'A'], 'heartbeats alone no longer keep the claim');
    const woke = acquireRunLock({ directory, key, session: 'A', now: hb + win + 1 });
    assert.equal(woke.acquired, false, 'the old holder loses the claim');
    assert.equal(a.record('step-3', hb + win + 2), false, 'and its record of an in-flight answer is refused');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a holder silent since one call is refused until staleMs, not progressMs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  try {
    const key = 'acme/app-639s'; const win = 10 * 60_000;
    acquireRunLock({ directory, key, session: 'A', now: 0 }).record('step-1', 0);
    assert.equal(acquireRunLock({ directory, key, session: 'B', now: 2 * win }).acquired, false, 'its agent may still be working');
    assert.equal(acquireRunLock({ directory, key, session: 'B', now: 31 * 60_000 }).acquired, true, 'staleMs still frees it');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('driveCommand records a takeover on the issue and the old holder stops without acting', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  let said = '';
  const log = console.log; console.log = text => { said = JSON.parse(text); };
  try {
    const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) } });
    const notes = []; repo.io.noteTakeover = (n, held, now) => notes.push([n, held.session, now]);
    const call = (session, now) => driveCommand(['3'], lanes, repo.io, { lockDirectory: directory, session, now });
    call('A', 1000);
    call('A', 1000 + 11 * 60_000);
    call('B', 1000 + 12 * 60_000);
    assert.equal(said.agent, 'implementer', 'the new session resumes with no owner step');
    assert.deepEqual(notes, [[3, 'A', 1000 + 12 * 60_000]]);
    call('A', 1000 + 13 * 60_000);
    assert.match(said.blocked.reason, /another drive session/, 'the old holder is refused and acts on nothing');
  } finally { console.log = log; rmSync(directory, { recursive: true, force: true }); }
});

test('driveCommand keeps the claim across calls until drive returns done, owner or blocked', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  let said = '';
  const log = console.log; console.log = text => { said = JSON.parse(text); };
  try {
    const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) } });
    const call = (session, now) => driveCommand(['3'], lanes, repo.io, { lockDirectory: directory, session, now });
    call('A', 1000);
    assert.equal(said.agent, 'implementer', 'an agent step leaves the session in flight');
    call('B', 2000);
    assert.match(said.blocked.reason, /another drive session/, 'a second session is not handed the same step');
    call('A', 3000);
    assert.equal(said.agent, 'implementer');
    call('B', 3000 + 31 * 60_000);
    assert.equal(said.agent, 'implementer', 'an idle session is taken over');
    repo.s.trees[3].dirty = true;
    const hb = join(directory, 'hb.txt'); writeFileSync(hb, 'status: blocked\nnote: needs a credential\n');
    driveCommand(['3', '--hand-back', hb], lanes, repo.io, { lockDirectory: directory, session: 'B', now: 4000 + 31 * 60_000 });
    assert.match(said.owner, /credential/);
    call('C', 5000 + 31 * 60_000);
    assert.equal(said.blocked, undefined, 'an owner step released the claim');
  } finally { console.log = log; rmSync(directory, { recursive: true, force: true }); }
});

test('driveCommand names the commit the configuration came from', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  let said = '';
  const log = console.log; console.log = text => { said = JSON.parse(text); };
  try {
    const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) } });
    driveCommand(['3'], { ...lanes, configCommit: 'c0ffee'.padEnd(40, '0') }, repo.io, { lockDirectory: directory, session: 'A', now: 1000 });
    assert.equal(said.configCommit, 'c0ffee'.padEnd(40, '0'));
    assert.equal(said.agent, 'implementer');
  } finally { console.log = log; rmSync(directory, { recursive: true, force: true }); }
});

test('a blocked hand-back returns the owner step even with uncommitted or unpushed work', () => {
  const base = { issue: started, pr: pr({ reviews: [review('fixes')] }), handBack: { status: 'blocked', note: 'needs a credential' } };
  for (const extra of [{ dirty: true }, { unpushed: true }, {}]) assert.match(decide({ ...base, tree: tree({ commits: 1, ...extra }) }).owner, /credential/, JSON.stringify(extra));
});

test('the session id is stable across one agent session\'s separate Bash calls and differs between sessions', () => {
  const drivePath = new URL('../../plugins/common/workflow/scripts/lib/drive.mjs', import.meta.url).href;
  const env = { ...process.env }; for (const key of ['WORKFLOW_DRIVE_SESSION', 'CLAUDE_SESSION_ID', 'CODEX_SESSION_ID']) delete env[key];
  const dir = mkdtempSync(join(tmpdir(), 'drive-session-'));
  try {
    writeFileSync(join(dir, 'id.mjs'), `import { driveSessionId } from ${JSON.stringify(drivePath)}; console.log(driveSessionId());`);
    // A long-lived "agent" node process runs two Bash calls; each is a fresh shell around a fresh drive process.
    writeFileSync(join(dir, 'agent.mjs'), `import { spawnSync } from 'node:child_process';
const call = () => spawnSync('sh', ['-c', 'node ' + ${JSON.stringify(join(dir, 'id.mjs'))}], { encoding: 'utf8' }).stdout.trim();
console.log(JSON.stringify([call(), call()]));`);
    const session = () => JSON.parse(spawnSync(process.execPath, [join(dir, 'agent.mjs')], { env, encoding: 'utf8' }).stdout);
  const [first, second] = session();
  assert.match(first, /^proc-/);
  assert.equal(first, second, 'two Bash calls of one session share its claim key');
  assert.notEqual(session()[0], first, 'another session is a different claim holder');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.equal(driveSessionId({ WORKFLOW_DRIVE_SESSION: 'x' }), 'x');
});

test('drive allows six concurrent runs per repository and a seventh waits until a slot frees', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  let said = '';
  const log = console.log; console.log = text => { said = JSON.parse(text); };
  try {
    assert.equal(maxRuns, 6);
    const repo = fakeRepo({ issues: Object.fromEntries([3, 4, 5, 6, 7, 8, 9].map(n => [n, issue({ number: n, labels: [label('state:started'), label('risk:R1')], assessment: assessed() })])), trees: Object.fromEntries([3, 4, 5, 6, 7, 8, 9].map(n => [n, tree({ path: `/w/${n}`, branch: `${n}-x`, commits: 1 })])) });
    const call = (n, now = 1000) => driveCommand([String(n)], lanes, repo.io, { lockDirectory: directory, session: `S${n}`, now });
    for (const n of [3, 4, 5, 6, 7, 8]) { call(n); assert.equal(said.agent, 'implementer', `run ${n} starts`); }
    call(9);
    assert.equal(said.wait.until, 'slot', 'the seventh waits');
    assert.deepEqual(said.command.slice(2), ['wait', 'slot']);
    call(3, 2000);
    assert.equal(said.agent, 'implementer', 'a run keeps its own slot');
    call(9, 2000 + 31 * 60_000);
    assert.equal(said.agent, 'implementer', 'stale claims free their slots');
    call(9, 2000 + 31 * 60_000);
    assert.equal(said.agent, 'implementer');
  } finally { console.log = log; rmSync(directory, { recursive: true, force: true }); }
});

test('one session holding several fresh claims counts as one run, and six other sessions still fill the slots', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  try {
    for (const n of [1, 2, 3, 4, 5]) acquireRunLock({ directory, key: `${lanes.repo}-${n}`, session: 'busy', now: 1000 });
    assert.equal(liveRuns({ directory, repo: lanes.repo, now: 1000 }), 1, 'five claims of one session are one run');
    assert.equal(liveRuns({ directory, repo: lanes.repo, now: 1000, session: 'busy' }), 0, 'a session never counts its own claims');
    for (const n of [11, 12, 13, 14, 15]) acquireRunLock({ directory, key: `${lanes.repo}-${n}`, session: `S${n}`, now: 1000 });
    assert.equal(liveRuns({ directory, repo: lanes.repo, now: 1000 }), 6);
    assert.equal(liveRuns({ directory, repo: lanes.repo, now: 1000, session: 'busy' }), 5);
    acquireRunLock({ directory, key: `${lanes.repo}-16`, session: 'S16', now: 1000 });
    assert.equal(liveRuns({ directory, repo: lanes.repo, now: 1000 + 31 * 60_000 }), 0, 'stale claims never count');
    assert.equal(liveRuns({ directory, repo: lanes.repo, now: 1000, session: 'busy' }), 6, 'six other sessions fill the slots');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a released claim frees a slot for the seventh run, and wait slot exits when one is free', () => {
  const directory = mkdtempSync(join(tmpdir(), 'drive-runs-'));
  try {
    const held = [1, 2, 3, 4, 5, 6].map(n => acquireRunLock({ directory, key: `${lanes.repo}-${n}`, session: `S${n}`, now: 1000 }));
    let clock = 1000; const pauses = [];
    const code = waitSlotCommand([], lanes, { directory, now: () => clock, pause: seconds => { pauses.push(seconds); clock += seconds * 1000; if (pauses.length === 2) held[0].release(); } });
    assert.equal(code, 0);
    assert.equal(pauses.length, 2, 'it waited until a claim was released');
    const full = [1, 2, 3, 4, 5, 6].map(n => acquireRunLock({ directory, key: `${lanes.repo}-x${n}`, session: `S${n}`, now: 1000 }));
    assert.ok(full.every(lock => lock.acquired));
    assert.equal(waitSlotCommand([], lanes, { directory, now: () => clock, pause: seconds => { clock += seconds * 1000; } }), 0, 'non-numeric claims never count');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

const conflictFor = (extra = {}) => ({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, mergeable: 'CONFLICTING', reviews: [review('fixes')] })], ...extra });
const withMergeBase = (repo, result) => { repo.io.mergeBase = t => { repo.calls.push(['merge-base']); if (result.committed) t.unpushed = true; return result; }; };

test('a manifest-only base conflict is merged by drive with no model, then pushed', () => {
  const repo = fakeRepo(conflictFor());
  withMergeBase(repo, { conflicts: ['plugins/common/workflow/package-metadata.json'], committed: true, manifest: true });
  const step = drive(repo.io, 3, lanes, {});
  assert.deepEqual(repo.calls.slice(0, 2), [['merge-base'], ['push']]);
  assert.deepEqual(step.wait, { pr: 5, until: 'ci' }, 'the new head needs its checks');
  assert.equal(step.agent, undefined);
});

test('another mechanical base conflict goes to a Haiku conflict-resolver and its gated result is committed', () => {
  const repo = fakeRepo(conflictFor());
  withMergeBase(repo, { conflicts: ['src/a.js'], committed: false });
  const step = drive(repo.io, 3, lanes, {});
  assert.equal(step.agent, 'conflict-resolver');
  assert.equal(step.model, 'haiku');
  assert.match(repo.writes[step.brief], /agent: conflict-resolver/);
  assert.match(repo.writes[step.brief], /src\/a\.js/);
  repo.s.trees[3].merging = true; repo.s.trees[3].dirty = true;
  assert.equal(drive(repo.io, 3, lanes, {}).agent, 'conflict-resolver', 'rerunning repeats the resolver while its merge is in progress');
  drive(repo.io, 3, lanes, { agent: 'conflict-resolver', status: 'done', commit: 'chore: merge origin/main into 3-x', paths: ['src/a.js'], check: 'pass' });
  assert.deepEqual(repo.calls.slice(-2), [['commit'], ['push']]);
});

test('a conflict-resolver that fails the gate leaves the merge to the implementer', () => {
  for (const hb of [{ agent: 'conflict-resolver', status: 'done', commit: 'Merge', paths: ['a'], check: 'fail' }, { agent: 'conflict-resolver', status: 'blocked', note: 'needs a behavior call' }]) {
    const repo = fakeRepo(conflictFor({ trees: { 3: tree({ commits: 1, dirty: true, merging: true }) } }));
    withMergeBase(repo, { conflicts: ['src/a.js'], committed: false });
    const step = drive(repo.io, 3, lanes, hb);
    assert.equal(step.agent, 'implementer');
    assert.match(step.reason, /conflict-resolver failed the gate/);
    assert.ok(!repo.calls.some(call => call[0] === 'merge-base' || call[0] === 'commit'), 'nothing is merged again or committed');
    assert.equal(drive(repo.io, 3, lanes, {}).agent, 'implementer', 'a rerun stays with the implementer');
  }
});

test('mergeBaseIntoHead takes the base side of manifest conflicts and syncs, else leaves other conflicts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-base-'));
  const git = (...args) => { const r = spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.test', ...args], { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r; };
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'T'); git('config', 'user.email', 't@example.test');
    writeFileSync(join(dir, 'package-metadata.json'), '{"version":"1.0.0"}\n'); writeFileSync(join(dir, 'a.js'), 'one\n');
    git('add', '.'); git('commit', '-qm', 'init');
    git('checkout', '-qb', 'head');
    writeFileSync(join(dir, 'package-metadata.json'), '{"version":"1.1.0"}\n'); writeFileSync(join(dir, 'a.js'), 'head\n');
    git('commit', '-qam', 'head');
    git('checkout', '-q', 'main');
    writeFileSync(join(dir, 'package-metadata.json'), '{"version":"1.0.1"}\n');
    git('commit', '-qam', 'base manifest');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', 'head');
    const calls = [];
    const only = mergeBaseIntoHead({ path: dir, base: 'main', syncManifests: () => calls.push('sync'), commit: () => { calls.push('commit'); git('commit', '-qm', 'merge'); } });
    assert.deepEqual(only, { conflicts: ['package-metadata.json'], committed: true, manifest: true });
    assert.deepEqual(calls, ['sync', 'commit']);
    assert.equal(readFileSync(join(dir, 'package-metadata.json'), 'utf8'), '{"version":"1.0.1"}\n', 'the base version wins');
    assert.equal(git('rev-list', '--merges', '--count', 'HEAD').stdout.trim(), '1', 'a merge commit, never a rebase');
    // a code conflict next to a manifest conflict is left for the resolver
    git('checkout', '-q', 'main'); writeFileSync(join(dir, 'a.js'), 'base\n'); writeFileSync(join(dir, 'package-metadata.json'), '{"version":"1.0.2"}\n'); git('commit', '-qam', 'base again'); git('update-ref', 'refs/remotes/origin/main', 'main');
    git('checkout', '-q', 'head'); writeFileSync(join(dir, 'package-metadata.json'), '{"version":"1.2.0"}\n'); git('commit', '-qam', 'head again');
    const mixed = mergeBaseIntoHead({ path: dir, base: 'main', syncManifests: () => assert.fail('no sync'), commit: () => assert.fail('no commit') });
    assert.equal(mixed.committed, false);
    assert.deepEqual(mixed.conflicts.sort(), ['a.js', 'package-metadata.json']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.ok(isManifestPath('plugins/common/core/.claude-plugin/plugin.json') && isManifestPath('.claude-plugin/marketplace.json') && !isManifestPath('src/a.js'));
});

test('the merge commit message passes the real commit command on a merge in progress', t => {
  const f = fixture(t);
  const g = (...args) => run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: f.repo });
  writeFileSync(join(f.repo, 'song.txt'), 'base'); assert.equal(g('add', 'song.txt').status, 0); assert.equal(g('commit', '-qm', 'base').status, 0);
  assert.equal(g('checkout', '-qb', 'other').status, 0);
  writeFileSync(join(f.repo, 'other.txt'), 'theirs'); assert.equal(g('add', 'other.txt').status, 0); assert.equal(g('commit', '-qm', 'other').status, 0);
  assert.equal(g('checkout', '-q', 'feature/test').status, 0);
  assert.equal(g('merge', '--no-ff', '--no-commit', 'other').status, 0);
  const message = mergeCommitMessage('main', 'feature/test');
  const result = f.cliRun('commit', '--message', message);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.linkedGit('show', '-s', '--format=%p', 'HEAD').stdout.trim().split(' ').length, 2);
  assert.equal(f.linkedGit('show', '-s', '--format=%s', 'HEAD').stdout.trim(), message);
});

test('a refinement that found nothing to change closes with its evidence and counts as delivered', () => {
  const marker = '<!-- workflow:epic-refinement -->';
  const refinement = issue({ number: 99, body: marker, labels: [label('state:started')] });
  const empty = { status: 'done', paths: [], body: '/w/.wf/evidence.md' };
  assert.deepEqual(decide({ issue: refinement, tree: tree(), handBack: empty }), { do: 'close-no-change' });
  assert.equal(decide({ issue: started, tree: tree(), handBack: empty }).agent, 'implementer', 'a non-refinement still needs a commit');
  assert.equal(decide({ issue: refinement, tree: tree(), handBack: { status: 'done', paths: [] } }).agent, 'implementer', 'evidence is required');

  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const repo = fakeRepo({ issues: { 9: epic, 99: refinement }, subs: { 9: [99] }, lessons: [9], trees: { 99: tree({ path: '/w/99' }) } });
  const posted = [];
  repo.io.closeNoChange = (i, t, hb) => { posted.push([i.number, hb.body]); i.state = 'CLOSED'; };
  const step = drive(repo.io, 99, lanes, empty);
  assert.deepEqual(posted, [[99, '/w/.wf/evidence.md']]);
  assert.equal(step.done.issue, 99);
  assert.match(drive(repo.io, 9, lanes, {}).owner, /missing closing PR merged into main for #99/);
  repo.io.noChangeEvidence = n => n === 99;
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { done: { epic: 9 } });
});
