import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCommand, chooseSlot, checkSlots, decideEpic, decideIssue, dependencyOrder, drive, estimateRisk, matchesPattern,
  driveCommand, modelFor, nextTarget, ownerPatterns, parseHandBack, pickSlice, reviewerCommand, riskFromPaths, staleReviewClaim,
} from '../../plugins/common/workflow/scripts/lib/drive.mjs';
import { dependenciesFromIssueBody } from '../../plugins/common/workflow/scripts/lib/board.mjs';
import { findCycle, readDependencies, splitDependencies } from '../../plugins/common/workflow/scripts/lib/dependencies.mjs';

const head = 'a'.repeat(40);
const lanes = { repo: 'acme/app', base: 'main', implementer: 'builder', reviewer: 'reviewer', owner: 'owner', steps: { test: ['just', 'verify'] } };
const label = name => ({ name });
const review = (verdict, state = 'COMMENTED') => ({ author: { login: 'reviewer' }, state, body: `<!-- agent-review sha=${head} round=1 verdict=${verdict} -->`, commit: { oid: head } });
const green = [{ name: 'verify', conclusion: 'SUCCESS' }];
const issue = (extra = {}) => ({ number: 3, url: 'https://github.com/acme/app/issues/3', state: 'OPEN', title: 'feat(app): add a thing', body: '', labels: [], ...extra });
const pr = (extra = {}) => ({ number: 5, url: 'https://github.com/acme/app/pull/5', state: 'OPEN', isDraft: true, headRefOid: head, headRefName: '3-add-a-thing', labels: [label('risk:R1')], mergeable: 'MERGEABLE', statusCheckRollup: green, reviews: [], body: 'Closes #3', closingIssuesReferences: [{ number: 3, repository: { owner: { login: 'acme' }, name: 'app' } }], files: [], ...extra });
const tree = (extra = {}) => ({ path: '/repo/.worktrees/3-add-a-thing', branch: '3-add-a-thing', dirty: false, commits: 0, unpushed: false, diffPaths: [], subjects: [], ...extra });
const started = issue({ labels: [label('state:started'), label('risk:R1')] });
const decide = facts => decideIssue({ blockers: [], patterns: [], diffPaths: [], handBack: {}, ...facts }, lanes);

test('an unstarted issue starts, and a blocked one reports its blockers', () => {
  assert.deepEqual(decide({ issue: issue() }), { do: 'start' });
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
  assert.deepEqual(decide({ ...base, pr: pr({ isDraft: false, reviews: [review('ready')] }) }), { agent: 'reviewer', mode: 'approve', reason: 'no approval at the head', round: 1 });
  assert.deepEqual(decide({ ...base, pr: pr({ isDraft: false, reviews: [review('ready', 'APPROVED')] }) }), { do: 'auto-merge' });
  assert.deepEqual(decide({ ...base, pr: pr({ isDraft: false, reviews: [review('ready', 'APPROVED')], autoMergeRequest: { enabledAt: 'x' } }) }), { wait: { pr: 5, until: 'merged' } });
  assert.deepEqual(decide({ ...base, pr: pr({ state: 'MERGED' }) }), { do: 'close' });
  assert.deepEqual(decide({ issue: issue({ state: 'CLOSED' }), tree: tree() }), { do: 'remove-worktree' });
  assert.deepEqual(decide({ issue: issue({ state: 'CLOSED' }) }), { done: { issue: 3 } });
});

test('a Reviewer claim older than an hour with no review since is released and the reviewer dispatched again', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const claimed = pr({ labels: [label('risk:R1'), label('state:reviewing')] });
  const since = Date.parse('2026-11-11T10:00:00Z'); const hour = 60 * 60_000;
  assert.deepEqual(decide({ ...base, pr: claimed, reviewingSince: since, now: since + hour - 1 }), { wait: { pr: 5, until: 'reviewed' } });
  assert.deepEqual(decide({ ...base, pr: claimed, reviewingSince: since, now: since + hour }), { do: 'release-review' });
  const posted = { ...review('fixes', 'COMMENTED'), submittedAt: '2026-11-11T10:30:00Z' };
  assert.equal(staleReviewClaim({ ...claimed, reviews: [posted] }, lanes, since, since + 2 * hour), false, 'a review after the claim is not stale');
  assert.equal(staleReviewClaim(claimed, lanes, null, since + 2 * hour), false, 'no label event, no release');
});

test('drive releases a stale Reviewer claim, then dispatches the reviewer', () => {
  const since = Date.parse('2026-11-11T10:00:00Z');
  const repo = fakeRepo({ issues: { 3: started }, trees: { 3: tree({ commits: 1 }) }, prs: [pr({ issue: 3, labels: [label('risk:R1'), label('state:reviewing')] })] });
  Object.assign(repo.io, { reviewingSince: () => since, now: () => since + 61 * 60_000 });
  const step = drive(repo.io, 3, lanes, {});
  assert.deepEqual(repo.calls, [['release-review', 5]]);
  assert.deepEqual([step.agent, step.mode], ['reviewer', 'review']);
});

test('only risk R2 or the round cap brings in the owner; line count never does', () => {
  const base = { issue: started, tree: tree({ commits: 1 }) };
  const approved = [review('ready', 'APPROVED')];
  assert.equal(decide({ ...base, pr: pr({ isDraft: false, labels: [label('risk:R2')], reviews: approved }) }).owner, 'risk R2');
  assert.ok(decide({ ...base, pr: pr({ reviews: [review('cap')] }) }).owner);
  const huge = Array.from({ length: 5000 }, (_, i) => `src/file${i}.js`);
  assert.equal(decide({ ...base, diffPaths: huge, pr: pr({ isDraft: false, reviews: approved }) }).do, 'auto-merge');
});

test('risk: estimated from the issue, recomputed from the diff, and only ever rises', () => {
  const patterns = ownerPatterns('* @reviewer\n/.github/CODEOWNERS @owner\n/.agents/config.json @owner\n', 'owner');
  assert.deepEqual(patterns, ['/.github/CODEOWNERS', '/.agents/config.json']);
  assert.ok(matchesPattern('.agents/config.json', '/.agents/config.json'));
  assert.ok(matchesPattern('a/b/x.js', 'b/'));
  assert.equal(riskFromPaths(['.agents/config.json'], patterns), 'R2');
  assert.equal(riskFromPaths(['plugins/x/scripts/lib/a.mjs']), 'R2');
  assert.equal(riskFromPaths(['.github/workflows/ci.yml']), 'R2');
  assert.equal(riskFromPaths(['plugins/x/skills/review/SKILL.md', 'docs/a.md']), 'R0');
  assert.equal(riskFromPaths(['src/app.js']), 'R1');
  assert.equal(riskFromPaths(null), 'R1');
  const scoped = paths => issue({ body: `\`\`\`scope\n${JSON.stringify({ paths })}\n\`\`\`` });
  assert.equal(estimateRisk(scoped(['docs/a.md']), patterns), 'R0');
  assert.equal(estimateRisk(scoped(['scripts/a.mjs']), patterns), 'R2');
  assert.equal(estimateRisk(issue({ labels: [label('risk:R2')], body: '' }), patterns), 'R2');
  const base = { issue: started, tree: tree({ commits: 1 }) };
  assert.deepEqual(decide({ ...base, diffPaths: ['scripts/a.mjs'], pr: pr() }), { do: 'risk', risk: 'R2' });
  assert.equal(decide({ ...base, diffPaths: ['docs/a.md'], pr: pr({ labels: [label('risk:R2')] }) }).do, undefined, 'never lowers R2');
  assert.deepEqual([modelFor('R0'), modelFor('R1'), modelFor('R2')], ['sonnet', 'sonnet', 'opus']);
});

test('hand-backs are at most 5 lines of key: value', () => {
  assert.deepEqual(parseHandBack('status: done\ncommit: feat(a): b\npaths: a.js b.js\ncheck: pass\nnote: ok\nextra: dropped'), { status: 'done', commit: 'feat(a): b', paths: ['a.js', 'b.js'], check: 'pass', note: 'ok' });
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
    issue: n => s.issues[n], dependencies: i => [...(s.blockers?.[i.number] || []).map(m => ({ number: m, kind: 'issue', state: 'OPEN' })), ...(s.deps?.[i.number] || [])], subIssues: n => (s.subs?.[n] || []).map(m => ({ number: m, state: s.issues[m].state, body: s.issues[m].body })),
    pr: n => (s.prs || []).find(p => p.issue === n && p.state === 'OPEN') || null, tree: n => s.trees?.[n] || null, patterns: () => [],
    openIssues: () => Object.values(s.issues).filter(i => i.state === 'OPEN'),
    start: (i, risk) => { calls.push(['start', i.number, risk]); i.labels = [label('state:started'), label(`risk:${risk}`)]; (s.trees ||= {})[i.number] = tree({ path: `/w/${i.number}`, branch: `${i.number}-x` }); },
    commit: (t, message, paths) => { calls.push(['commit']); t.diffPaths = paths; t.dirty = false; t.commits++; t.unpushed = true; },
    push: t => { calls.push(['push']); t.unpushed = false; },
    open: (i, t, risk) => { calls.push(['open', i.number, risk]); (s.prs ||= []).push(pr({ issue: i.number, number: 50 + i.number, labels: [label(`risk:${risk}`)] })); },
    reviewingSince: () => null,
    releaseReview: p => { calls.push(['release-review', p.number]); p.labels = p.labels.filter(l => l.name !== 'state:reviewing'); },
    risk: (p, from, to) => { calls.push(['risk', to]); p.labels = [label(`risk:${to}`)]; },
    ready: p => { calls.push(['ready']); p.isDraft = false; },
    autoMerge: p => { calls.push(['auto-merge']); p.autoMergeRequest = {}; },
    close: i => { calls.push(['close', i.number]); i.state = 'CLOSED'; },
    closeEpic: e => { calls.push(['close-epic', e.number]); e.state = 'CLOSED'; },
    removeTree: t => { calls.push(['remove', t.path]); },
    scratch: t => `${t?.path || '/repo'}/.wf`,
    write: (path, text) => { writes[path] = text; },
  };
  return { s, io, calls, writes };
}

test('drive performs the mechanical steps and stops at one instruction; re-running repeats it', () => {
  const repo = fakeRepo({ issues: { 3: issue({ body: '```scope\n{"paths":["docs/a.md"]}\n```' }) } });
  const first = drive(repo.io, 3, lanes, {});
  assert.deepEqual(repo.calls, [['start', 3, 'R0']]);
  assert.deepEqual({ ...first, brief: undefined }, { agent: 'implementer', model: 'sonnet', brief: undefined, issue: 3, pr: null, session: 'subagent', mode: 'build', cwd: '/w/3' });
  assert.equal(first.brief, '/w/3/.wf/drive-3-implementer.md');
  assert.match(repo.writes[first.brief], /status: done \| replan \| blocked/);
  const brief = repo.writes[first.brief];
  assert.deepEqual(drive(repo.io, 3, lanes, {}), first, 'idempotent');
  assert.equal(repo.writes[first.brief], brief);
  assert.equal(repo.calls.length, 1);
  repo.s.trees[3].dirty = true;
  const reviewer = drive(repo.io, 3, lanes, { status: 'done', commit: 'docs(a): b', paths: ['docs/a.md'] });
  assert.deepEqual(repo.calls.slice(1), [['commit'], ['push'], ['open', 3, 'R0']]);
  assert.equal(reviewer.agent, 'reviewer');
  assert.equal(reviewer.session, 'separate');
  assert.equal(reviewer.pr, 53);
  assert.deepEqual(reviewer.command.slice(0, 7), ['claude', '--print', '--agent', 'filipkrawiec-workflow:reviewer', '--model', 'sonnet', '--permission-mode']);
  assert.deepEqual(drive(repo.io, 3, lanes, { status: 'done', commit: 'docs(a): b', paths: ['docs/a.md'] }), reviewer, 'a repeated hand-back changes nothing');
  repo.s.prs[0].reviews = [review('ready')];
  const approve = drive(repo.io, 3, lanes, {});
  assert.deepEqual(repo.calls.at(-1), ['ready']);
  assert.equal(approve.mode, 'approve');
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
  const repo = fakeRepo({ issues: { 3: issue({ labels: [label('risk:R2')] }) } });
  assert.equal(drive(repo.io, 3, lanes, {}).model, 'opus');
  repo.s.trees[3].dirty = true;
  const reviewer = drive(repo.io, 3, lanes, { status: 'done', commit: 'feat(a): b', paths: ['a'] });
  assert.equal(reviewer.model, 'opus');
  assert.ok(reviewer.command.includes('opus'));
  Object.assign(repo.s.prs[0], { isDraft: false, reviews: [review('owner', 'APPROVED')], labels: [label('risk:R2'), label('review:owner')] });
  assert.equal(drive(repo.io, 3, lanes, {}).owner, 'review:owner');
});

test('drive <epic> plans, drives the first ready slice, lists the others and closes the epic', () => {
  const epic = issue({ number: 9, title: 'epic', labels: [label('type:epic')] });
  const empty = fakeRepo({ issues: { 9: epic } });
  const planner = drive(empty.io, 9, lanes, {});
  assert.deepEqual([planner.agent, planner.model, planner.mode, planner.issue], ['planner', 'opus', 'slice', 9]);
  const repo = fakeRepo({ issues: { 9: epic, 10: issue({ number: 10 }), 11: issue({ number: 11 }), 12: issue({ number: 12 }) }, subs: { 9: [10, 11, 12] }, blockers: { 11: [10] } });
  const result = drive(repo.io, 9, lanes, {});
  assert.deepEqual([result.agent, result.issue, result.epic, result.alsoReady], ['implementer', 10, 9, [12]]);
  for (const n of [10, 11, 12]) repo.s.issues[n].state = 'CLOSED';
  repo.s.blockers = {};
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
  const done = args => (args[0] === 'pr' && args[1] === 'list' ? [{ number: 9, body: 'Closes #7', closingIssuesReferences: [] }] : args[0] === 'api' && args[1].endsWith('blocked_by') ? [{ number: 7 }, { number: 8 }] : { state: 'closed', state_reason: 'completed', labels: [], body: '' });
  assert.deepEqual(splitDependencies(readDependencies('acme/app', { number: 3, body: '' }, done)), { blockers: [], dropped: [8] }, 'closed as completed with no merged PR is dropped');
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
  assert.deepEqual(repo.calls, []);
});

test('a slice with a dropped dependency or an epic blocked by an epic is not driven', () => {
  const epic = issue({ number: 9, labels: [label('type:epic')] });
  const slices = [{ number: 12, state: 'OPEN', blockers: [], dropped: [7] }];
  assert.match(decideEpic({ epic, slices }).owner, /#12 depends on #7/);
  const repo = fakeRepo({ issues: { 9: epic, 8: issue({ number: 8, labels: [label('type:epic')] }), 10: issue({ number: 10 }) }, subs: { 9: [10] }, blockers: { 9: [8] } });
  assert.deepEqual(drive(repo.io, 9, lanes, {}), { blocked: { issue: 9, by: [8] } });
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
  try { driveCommand(['--next'], lanes, repo.io); } finally { console.log = log; }
  assert.deepEqual([JSON.parse(said).agent, JSON.parse(said).issue], ['planner', 4], 'drive --next picks the epic the issue waits for, not the blocked issue');
});

test('the reviewer runs as a separate non-interactive session', () => {
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
  const code = checkCommand([], lanes, { root: process.cwd(), directory: process.cwd(), probe: (_, name) => name === 'check-2', runner: (dir, names, cmd, args, opts) => { runs.push([names, cmd, args, opts.timeoutSeconds]); return { status: 0 }; } });
  assert.equal(code, 0);
  assert.deepEqual(runs, [[['check-2'], 'just', ['verify'], 3600]]);
  assert.throws(() => checkCommand([], { steps: {} }, { root: process.cwd(), directory: process.cwd(), probe: () => true, runner: () => ({ status: 0 }) }), /steps\.test/);
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
  const script = `import {checkCommand} from ${JSON.stringify(module)}; process.exitCode = checkCommand([], { steps: { test: [process.execPath, '-e', ${JSON.stringify(gate)}] } }, { root: process.cwd(), directory: ${JSON.stringify(directory)} });`;
  const runs = Array.from({ length: 3 }, () => new Promise(resolve => spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' }).on('exit', resolve)));
  assert.deepEqual(await Promise.all(runs), [0, 0, 0]);
  let running = 0; let peak = 0;
  for (const mark of readFileSync(log, 'utf8').trim().split('\n')) { running += mark === '+' ? 1 : -1; peak = Math.max(peak, running); }
  assert.ok(peak >= 1 && peak <= 2, `peak ${peak}`);
});
