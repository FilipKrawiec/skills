import test from 'node:test';
import assert from 'node:assert/strict';
import { ciState, nextCommand, prState, statusCommand, waitCommand } from '../../plugins/common/workflow/scripts/lib/state.mjs';
import { notBefore } from '../../plugins/common/workflow/scripts/lib/dependencies.mjs';
import { bugStats, bugsCommand, bugsLine, postIssueComment } from '../../plugins/common/workflow/scripts/lib/issues.mjs';

const head = 'a'.repeat(40);
const lanes = { repo: 'acme/app', base: 'main', implementer: 'builder', reviewer: 'reviewer', owner: 'owner' };
const review = (value, state = 'COMMENTED', oid = head) => ({ author: { login: 'reviewer' }, state, body: `<!-- agent-review sha=${oid} round=1 verdict=${value} -->`, commit: { oid } });
const green = [{ name: 'verify', conclusion: 'SUCCESS' }];
const pr = (extra = {}) => ({ number: 5, url: 'u', state: 'OPEN', isDraft: false, headRefOid: head, labels: [], mergeable: 'MERGEABLE', statusCheckRollup: green, reviews: [], body: 'Closes #3', closingIssuesReferences: [{ number: 3, repository: { owner: { login: 'acme' }, name: 'app' } }], ...extra });
const next = extra => prState(pr(extra), lanes).next;

test('ciState reads red over pending over green, and none without checks', () => {
  assert.equal(ciState([]), 'none');
  assert.equal(ciState(green), 'green');
  assert.equal(ciState([...green, { name: 'e2e', status: 'IN_PROGRESS' }]), 'pending');
  assert.equal(ciState([{ name: 'e2e', status: 'IN_PROGRESS' }, { name: 'verify', conclusion: 'FAILURE' }]), 'red');
});

test('status reports verdict, round, risk and linked issues of a PR', () => {
  const state = prState(pr({ labels: [{ name: 'risk:R1' }], reviews: [review('fixes', 'COMMENTED', 'b'.repeat(40)), review('ready', 'APPROVED')] }), lanes);
  assert.deepEqual([state.verdict, state.round, state.risk, state.issues, state.ci], ['ready', 1, 'R1', [3], 'green']);
});

test('the round counts verdicts that are not approvals or splits', () => {
  const old = 'b'.repeat(40);
  const reviews = [review('split', 'COMMENTED', old), review('fixes', 'COMMENTED', old), review('ready'), review('ready', 'APPROVED')];
  assert.equal(prState(pr({ reviews }), lanes).round, 2);
});

test('the next action follows the PR state, first match wins', () => {
  assert.equal(next({ state: 'MERGED' }).action, 'done');
  assert.deepEqual(next({ mergeable: 'CONFLICTING' }), { action: 'fix', actor: 'implementer', reason: 'conflicts with its base' });
  assert.equal(next({ statusCheckRollup: [{ name: 'verify', conclusion: 'FAILURE' }] }).action, 'fix');
  assert.deepEqual(next({ statusCheckRollup: [{ name: 'verify', status: 'QUEUED' }] }), { action: 'wait-ci', actor: 'cli' });
  assert.deepEqual(next({}), { action: 'review', actor: 'reviewer' });
  assert.equal(next({ reviews: [review('fixes')] }).actor, 'implementer');
  assert.deepEqual(next({ reviews: [review('ready', 'APPROVED')] }), { action: 'merge', actor: 'cli' });
});

test('an open PR that links no issue goes to the planner before anything else', () => {
  assert.deepEqual(next({ body: 'Bump a dependency', closingIssuesReferences: [] }), { action: 'link-issue', actor: 'planner', reason: 'no linked issue: spec files one and the body links it' });
  assert.deepEqual(next({ body: 'Closes #6', closingIssuesReferences: [] }), { action: 'review', actor: 'reviewer' }, 'a stacked PR closing its issue in the body is linked');
});

test('a ready verdict without a mode hands a draft to deliver and a ready PR to its approval', () => {
  assert.deepEqual(next({ isDraft: true, reviews: [review('ready')] }), { action: 'ready', actor: 'cli', reason: 'verdict ready on a draft' });
  assert.deepEqual(next({ reviews: [review('ready')] }), { action: 'review', actor: 'reviewer' });
  assert.equal(next({ reviews: [review('ready'), review('fixes')] }).actor, 'implementer', 'a later blocking verdict on a ready PR counts');
});

test('an author-mode ready verdict hands a draft off instead of reviewing it again', () => {
  const authorReady = { ...review('ready'), body: `<!-- agent-review sha=${head} round=1 mode=author verdict=ready -->` };
  assert.deepEqual(next({ isDraft: true, reviews: [authorReady] }), { action: 'ready', actor: 'cli', reason: 'verdict ready on a draft' });
});

test('the owner is asked only on a PR the Reviewer approved at its head', () => {
  assert.deepEqual(next({ labels: [{ name: 'risk:R2' }], reviews: [review('ready', 'APPROVED')] }), { action: 'merge', actor: 'cli' }, 'risk R2 alone merges on the Reviewer approval');
  assert.equal(next({ labels: [{ name: 'risk:R1' }], reviews: [review('ready', 'APPROVED')] }).action, 'merge');
  assert.equal(next({ isDraft: true, labels: [{ name: 'risk:R2' }], reviews: [review('ready')] }).action, 'ready', 'an R2 draft is readied, not handed to the owner');
  assert.equal(next({ labels: [{ name: 'risk:R2' }], reviews: [review('ready')] }).actor, 'reviewer', 'an unapproved R2 PR waits for the approval');
  assert.equal(next({ labels: [{ name: 'review:owner' }], reviews: [review('fixes')] }).actor, 'implementer', 'an owner hold never skips the fixes');
  assert.equal(next({ reviews: [review('fixes'), review('fixes'), review('fixes')] }).actor, 'implementer', 'no round count asks the owner');
  assert.equal(next({ reviews: [review('cap')] }).actor, 'reviewer', 'a retired cap verdict is not an approval');
  assert.deepEqual(next({ labels: [{ name: 'review:owner' }], reviews: [review('owner', 'APPROVED')] }), { action: 'owner-review', actor: 'owner', reason: 'review:owner' });
  const ownerApproved = { author: { login: 'owner' }, state: 'APPROVED', body: '', commit: { oid: head } };
  assert.equal(next({ labels: [{ name: 'review:owner' }], reviews: [review('owner', 'APPROVED'), ownerApproved] }).action, 'merge');
});

test('a ready PR behind its base brings the base in before any review, owner step or merge', () => {
  const behind = { mergeStateStatus: 'BEHIND' };
  assert.deepEqual(next({ ...behind, labels: [{ name: 'review:owner' }], reviews: [review('owner', 'APPROVED')] }), { action: 'update-branch', actor: 'cli', reason: 'behind its base' }, 'never the owner on a stale head');
  assert.equal(next({ ...behind, labels: [{ name: 'risk:R2' }], reviews: [review('ready', 'APPROVED')] }).action, 'update-branch');
  assert.equal(next({ ...behind, reviews: [review('ready', 'APPROVED')] }).action, 'update-branch');
  assert.equal(next({ ...behind, reviews: [review('ready')] }).action, 'update-branch', 'before the approval, too');
  assert.equal(next({ ...behind, isDraft: true, reviews: [review('ready')] }).action, 'ready', 'a draft is not merging yet');
  assert.deepEqual(next({ mergeStateStatus: 'DIRTY', reviews: [review('ready', 'APPROVED')] }), { action: 'fix', actor: 'implementer', reason: 'conflicts with its base' });
  assert.equal(prState(pr(behind), lanes).mergeState, 'BEHIND');
});

function waitOn(states, ...args) { return waitWith(lanes, states, ...args); }
function waitWith(cfg, states, ...args) {
  const lines = []; const log = console.log; console.log = line => lines.push(JSON.parse(line));
  let index = 0; let clock = 0; let pauses = 0;
  try {
    const code = waitCommand(['5', ...args], cfg, { read: () => pr(states[Math.min(index++, states.length - 1)]), pause: () => { pauses++; clock += 60_000; }, now: () => clock });
    return { code, lines, pauses };
  } finally { console.log = log; }
}

test('wait blocks until CI settles, printing each state change once', () => {
  const pending = { statusCheckRollup: [{ name: 'verify', status: 'IN_PROGRESS' }] };
  const result = waitOn([pending, pending, {}], '--until', 'ci');
  assert.equal(result.code, 0);
  assert.equal(result.pauses, 2);
  assert.deepEqual(result.lines.map(line => line.ci), ['pending', 'green']);
  assert.equal(waitOn([{ statusCheckRollup: [{ name: 'verify', conclusion: 'FAILURE' }] }], '--until', 'ci').code, 1);
});

test('wait treats no checks as pending while required checks are configured', () => {
  const pending = { statusCheckRollup: [{ name: 'verify', status: 'QUEUED' }] };
  const required = { ...lanes, requiredChecks: ['verify'] };
  const result = waitWith(required, [{ statusCheckRollup: [] }, pending, {}], '--until', 'ci');
  assert.equal(result.code, 0);
  assert.deepEqual(result.lines.map(line => line.ci), ['none', 'pending', 'green']);
  assert.equal(waitWith(required, [{ statusCheckRollup: [] }], '--until', 'ci', '--timeout', '2').code, 1);
  assert.equal(waitWith({ ...lanes, requiredChecks: [] }, [{ statusCheckRollup: [] }], '--until', 'ci').code, 0);
});

test('a repo whose merge publishes to production sends an approved PR to the owner through release', () => {
  const publishing = { ...lanes, publishOnMerge: true };
  assert.deepEqual(prState(pr({ reviews: [review('ready', 'APPROVED')] }), publishing).next, { action: 'owner-review', actor: 'owner', reason: 'merge publishes to production: invoke release' });
  const ownerApproved = { author: { login: 'owner' }, state: 'APPROVED', body: '', commit: { oid: head } };
  assert.equal(prState(pr({ reviews: [review('ready', 'APPROVED'), ownerApproved] }), publishing).next.action, 'merge');
});

test('wait --until base waits for the merge, then exits 1 on a red base at the merge commit', () => {
  const merged = { state: 'MERGED', mergeCommit: { oid: 'c'.repeat(40) } };
  const run = (checks, states) => {
    const lines = []; const log = console.log; console.log = line => lines.push(JSON.parse(line));
    let index = 0; const asked = [];
    try {
      const code = waitCommand(['5', '--until', 'base'], { ...lanes, requiredChecks: ['verify'] }, { read: () => pr(states[Math.min(index++, states.length - 1)]), checksAt: (repo, sha) => { asked.push(sha); return checks.shift() ?? []; }, pause: () => {}, now: () => 0 });
      return { code, lines, asked };
    } finally { console.log = log; }
  };
  const red = run([[], [{ name: 'verify', conclusion: 'FAILURE' }]], [{}, merged]);
  assert.equal(red.code, 1);
  assert.deepEqual(red.lines.map(line => line.base ?? null), [null, 'none', 'red']);
  assert.equal(red.asked[0], 'c'.repeat(40));
  assert.equal(run([[{ name: 'verify', conclusion: 'SUCCESS' }]], [merged]).code, 0);
});

test('wait ends on a verdict, on merge, on a closed PR and on timeout', () => {
  assert.equal(waitOn([{}, { reviews: [review('fixes')] }], '--until', 'reviewed').code, 0);
  assert.equal(waitOn([{ state: 'MERGED' }], '--until', 'merged').code, 0);
  assert.equal(waitOn([{ state: 'CLOSED' }], '--until', 'merged').code, 1);
  const stuck = waitOn([{}], '--until', 'merged', '--timeout', '3');
  assert.equal(stuck.code, 1);
  assert.equal(stuck.pauses, 3);
});

test('wait --until merged sweeps closed cards to Done once the PR merges, and only then', () => {
  const run = (state, until = 'merged') => {
    let sweeps = 0; const log = console.log; console.log = () => {};
    try {
      const code = waitCommand(['5', '--until', until], lanes, { read: () => pr({ state }), sweep: () => { sweeps++; return [3]; }, pause: () => {}, now: () => 0 });
      return { code, sweeps };
    } finally { console.log = log; }
  };
  assert.deepEqual(run('MERGED'), { code: 0, sweeps: 1 });
  assert.deepEqual(run('CLOSED'), { code: 1, sweeps: 0 });
  assert.deepEqual(run('MERGED', 'ci'), { code: 0, sweeps: 0 });
});

test('wait --until merged moves the closing issues of the merged PR itself before the sweep, so a late issue close skips no card', () => {
  const order = []; const log = console.log; console.log = () => {};
  try {
    const closing = [{ number: 7, repository: { owner: { login: 'acme' }, name: 'app' } }];
    const code = waitCommand(['5', '--until', 'merged'], lanes, { read: () => pr({ state: 'MERGED', closingIssuesReferences: closing }), moveClosing: (l, merged) => { order.push(['move', merged.closingIssuesReferences.map(i => i.number)]); }, sweep: () => { order.push(['sweep']); return []; }, pause: () => {}, now: () => 0 });
    assert.equal(code, 0);
  } finally { console.log = log; }
  assert.deepEqual(order, [['move', [7]], ['sweep']]);
});

test('wait --until merged exits 1 on a PR behind or in conflict with its base, printing the state', () => {
  const error = console.error; const errors = []; console.error = line => errors.push(line);
  try {
    for (const state of ['BEHIND', 'DIRTY']) {
      const result = waitOn([{ mergeStateStatus: 'BLOCKED' }, { mergeStateStatus: state }], '--until', 'merged');
      assert.equal(result.code, 1);
      assert.deepEqual(result.lines.map(line => line.merge_state), ['BLOCKED', state]);
    }
    assert.match(errors[0], /#5 is BEHIND against its base; run drive/);
    assert.equal(waitOn([{ mergeStateStatus: 'BEHIND' }], '--until', 'ci').code, 0, 'only a merge wait ends on it');
  } finally { console.error = error; }
});

test('wait refuses an unknown condition', () => {
  assert.throws(() => waitCommand(['5', '--until', 'forever'], lanes), /Usage: wait/);
});

// A fake `gh`: each issue is { state, reason, body, labels, blockedBy, subs }.
function fakeGh(issues, prs = []) {
  return args => {
    const [kind, path] = args;
    const key = args.join(' ');
    const at = /issues\/(\d+)/.exec(path || '')?.[1];
    if (kind === 'api' && args.at(-1).includes('/blocked_by')) return [(issues[args.at(-1).match(/issues\/(\d+)/)[1]].blockedBy || []).map(number => ({ number }))];
    if (kind === 'api' && path.includes('/sub_issues')) return (issues[at].subs || []).map(number => ({ number, state: issues[number].state, body: issues[number].body || '' }));
    if (kind === 'api') return { state: issues[at].state, state_reason: issues[at].reason, labels: (issues[at].labels || []).map(name => ({ name })), body: issues[at].body || '' };
    if (key.startsWith('issue view')) { const n = Number(args[2]); return { number: n, url: `u/${n}`, state: issues[n].state.toUpperCase(), title: 't', body: issues[n].body || '', labels: (issues[n].labels || []).map(name => ({ name })) }; }
    if (key.includes('--label lane:owner')) return [];
    if (key.startsWith('issue list')) return Object.entries(issues).filter(([, item]) => item.state === 'open').map(([number, item]) => ({ number: Number(number), url: `u/${number}`, body: item.body || '', labels: (item.labels || []).map(name => ({ name })) }));
    if (key.startsWith('pr list --repo acme/app --state open')) return prs;
    throw new Error(`unexpected gh ${key}`);
  };
}
function captured(run) {
  let said = '';
  const log = console.log; console.log = text => { said = text; };
  try { run(); } finally { console.log = log; }
  return JSON.parse(said);
}

test('status lists an issue\'s unmet dependencies, from blocked-by links and the scope packet', () => {
  const issues = { 3: { state: 'open', body: '```scope\n{"dependencies":[5]}\n```', blockedBy: [4] }, 4: { state: 'open' }, 5: { state: 'open' } };
  const result = captured(() => statusCommand(['3'], lanes, fakeGh(issues)));
  assert.deepEqual(result.blockedBy, [4, 5]);
  assert.equal(result.next.action, 'wait');
  issues[4] = { state: 'closed', reason: 'completed', labels: ['type:epic'] };
  issues[5] = { state: 'closed', reason: 'completed', labels: ['type:epic'] };
  assert.equal(captured(() => statusCommand(['3'], lanes, fakeGh(issues))).next.action, 'start');
});

test('next --owner shows items blocked by a dropped dependency or a cycle', () => {
  const issues = {
    3: { state: 'open', blockedBy: [2] }, 2: { state: 'closed', reason: 'not_planned' },
    9: { state: 'open', labels: ['type:epic'], subs: [12, 14] }, 12: { state: 'open', blockedBy: [14] }, 14: { state: 'open', blockedBy: [12] },
    20: { state: 'open' },
  };
  const items = captured(() => nextCommand(['--owner'], lanes, fakeGh(issues)));
  assert.deepEqual(items.map(item => [item.number, item.actor]), [[3, 'owner'], [9, 'owner']]);
  assert.match(items[0].reason, /^#3 depends on #2, closed as not planned/);
  assert.equal(items[1].reason, 'dependency cycle #12 → #14 → #12');
});

const codeowners = '* @reviewer\n/.github/CODEOWNERS @owner\n/scripts/tests/workflow-decisions.test.mjs @owner\n';
const owned = (files, extra = {}) => prState(pr({ files: files.map(path => ({ path })), ...extra }), { ...lanes, codeowners }).next;

test('a PR touching a path whose code owner is not the Reviewer goes to the owner as soon as it is approved', () => {
  const approved = [review('ready', 'APPROVED')];
  const next = owned(['src/a.js', '.github/CODEOWNERS', 'scripts/tests/workflow-decisions.test.mjs'], { reviews: approved });
  assert.deepEqual([next.action, next.actor], ['owner-review', 'owner']);
  assert.match(next.reason, /owner can approve: \.github\/CODEOWNERS, scripts\/tests\/workflow-decisions\.test\.mjs$/);
  assert.equal(owned(['src/a.js'], { reviews: approved }).action, 'merge', 'paths the Reviewer owns merge');
  assert.equal(owned(['src/a.js'], { labels: [{ name: 'risk:R2' }], reviews: approved }).action, 'merge', 'plain R2 merges');
  assert.equal(owned(['.github/CODEOWNERS'], { reviews: [review('ready')] }).actor, 'reviewer', 'unapproved: the Reviewer first');
  const ownerApproved = { author: { login: 'owner' }, state: 'APPROVED', body: '', commit: { oid: head } };
  assert.equal(owned(['.github/CODEOWNERS'], { reviews: [...approved, ownerApproved] }).action, 'merge');
  assert.equal(prState(pr({ files: [{ path: '.github/CODEOWNERS' }], reviews: approved }), lanes).next.action, 'merge', 'without CODEOWNERS rules nothing is held');
});

// Bug inflow: a stubbed search keyed by the qualifiers in the query.
const day = 86_400_000;
const now = Date.parse('2026-11-19T12:00:00Z');
const bug = (created, closed, extra = {}) => ({ created_at: created, closed_at: closed, state_reason: closed ? 'completed' : null, body: '', ...extra });
function fakeSearch(repoSeen = []) {
  const opened = [bug('2026-11-10T00:00:00Z', null), bug('2026-11-11T00:00:00Z', '2026-11-12T00:00:00Z'), bug('2026-11-12T00:00:00Z', '2026-11-12T12:00:00Z')];
  const closed = [
    bug('2026-11-01T00:00:00Z', '2026-11-12T00:00:00Z'),
    bug('2026-11-12T00:00:00Z', '2026-11-12T12:00:00Z'),
    bug('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z', { state_reason: 'not_planned', body: '<!-- workflow:consolidated-into 9 -->' }),
    bug('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z', { state_reason: 'duplicate' }),
    bug('2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z', { state_reason: 'not_planned' }),
  ];
  return args => {
    const q = args.find(arg => arg.startsWith('q='));
    repoSeen.push(q);
    assert.match(q, /label:"type:bug"/);
    if (q.includes('is:open')) { assert.ok(args.includes('per_page=1')); return { total_count: 4, items: [] }; }
    assert.ok(args.includes('--paginate'));
    if (q.includes('created:>=2026-11-05T12:00:00Z')) return [{ total_count: 3, items: opened }];
    if (q.includes('closed:>=2026-11-05T12:00:00Z')) return [{ total_count: 5, items: closed.slice(0, 3) }, { total_count: 5, items: closed.slice(3) }];
    throw new Error(`unexpected search ${q}`);
  };
}

test('bugStats counts opened, closed, open, median time to close and duplicates in the window', () => {
  const stats = bugStats('acme/app', 14, fakeSearch(), now);
  // Closed durations: 11d, 12h, 1d, 1d, 1d: the median is 1d.
  assert.deepEqual(stats, { repo: 'acme/app', days: 14, since: '2026-11-05T12:00:00Z', until: '2026-11-19T12:00:00Z', opened: 3, closed: 5, open: 4, medianMs: day, duplicates: 2 });
});

test('bugs prints one line per repo, and the status line carries the same numbers', () => {
  const lines = [];
  const log = console.log; console.log = text => lines.push(text);
  try { bugsCommand(['--days', '14'], { repo: 'acme/app' }, fakeSearch(), now); } finally { console.log = log; }
  assert.equal(lines.length, 1);
  assert.equal(lines[0], 'acme/app (14d): opened 3, closed 5, open 4, median time to close 1d, duplicates 2 (target 0); window 2026-11-05T12:00:00Z to 2026-11-19T12:00:00Z');
  assert.equal(bugsLine(bugStats('acme/app', 14, fakeSearch(), now)), 'Bugs (14d): opened 3, closed 5, open 4, median time to close 1d, duplicates 2 (target 0)');
});

test('bugs --repo reports that repo and --days rejects a non-positive value', () => {
  const seen = [];
  const lines = [];
  const log = console.log; console.log = text => lines.push(text);
  try { bugsCommand(['--repo', 'other/lib'], { repo: 'acme/app' }, fakeSearch(seen), now); } finally { console.log = log; }
  assert.match(lines[0], /^other\/lib \(14d\):/);
  assert.ok(seen.every(q => q.includes('repo:other/lib')));
  for (const bad of [['--days', '0'], ['--days', '-3'], ['--days', 'x'], ['--repo', 'nope'], ['--days']]) {
    assert.throws(() => bugsCommand(bad, { repo: 'acme/app' }, fakeSearch(), now), /Usage: bugs/);
  }
});

test('bugs --since starts the window at that timestamp and prints it', () => {
  const lines = [];
  const log = console.log; console.log = text => lines.push(text);
  try { bugsCommand(['--since', '2026-11-05T12:00:00Z'], { repo: 'acme/app' }, fakeSearch(), now); } finally { console.log = log; }
  assert.match(lines[0], /^acme\/app \(since 2026-11-05T12:00:00Z\): opened 3,.*; window 2026-11-05T12:00:00Z to 2026-11-19T12:00:00Z$/);
  for (const bad of [['--since', 'yesterday'], ['--since', '2026-11-05'], ['--since', '2026-11-05T12:00:00Z', '--days', '3']]) {
    assert.throws(() => bugsCommand(bad, { repo: 'acme/app' }, fakeSearch(), now), /Usage: bugs/);
  }
});

test('status of an issue also prints one Bugs (14d) line', () => {
  const issues = { 3: { state: 'open' } };
  const base = fakeGh(issues);
  const search = fakeSearch();
  const lines = [];
  const log = console.log, error = console.error; console.log = text => lines.push(text); console.error = text => lines.push(text);
  try { statusCommand(['3'], lanes, args => (args.find(arg => String(arg).startsWith('q=')) ? search(args) : base(args)), undefined, now); } finally { console.log = log; console.error = error; }
  assert.equal(lines.filter(line => line.startsWith('Bugs (14d):')).length, 1);
  assert.equal(JSON.parse(lines.find(line => line.startsWith('{'))).number, 3);
});

test('wait --until ci never settles on the previous head after a push', () => {
  const pushed = 'f'.repeat(40);
  const stale = pr({ headRefName: 'topic', headRefOid: head }); // a cached rollup of the old head: green
  const fresh = pr({ headRefName: 'topic', headRefOid: pushed, statusCheckRollup: [{ name: 'verify', status: 'IN_PROGRESS' }] });
  const run = (cached, uncached, until = 'ci') => {
    const lines = []; const log = console.log; console.log = line => lines.push(JSON.parse(line));
    let index = 0; let clock = 0;
    try {
      const code = waitCommand(['5', '--until', until, '--timeout', '3'], lanes, { read: () => cached[Math.min(index++, cached.length - 1)], readFresh: () => uncached, localHead: name => name === 'topic' ? pushed : null, remoteAhead: () => false, pause: () => { clock += 60_000; }, now: () => clock });
      return { code, lines };
    } finally { console.log = log; }
  };
  const settledOnOld = run([stale], stale);
  assert.equal(settledOnOld.code, 1, 'times out instead of exiting 0 on the old head');
  assert.ok(settledOnOld.lines.every(line => line.ci === 'pending'), 'the old head reads as pending');
  const caughtUp = pr({ headRefName: 'topic', headRefOid: pushed });
  const result = run([stale, caughtUp], stale);
  assert.equal(result.code, 0, 'once a read shows the pushed head, its checks settle');
  const recovered = run([stale], caughtUp);
  assert.equal(recovered.code, 0, 'a fresh read of the pushed head settles');
  assert.equal(recovered.lines.at(-1).head, pushed);
});

test('wait --until ci settles when GitHub is ahead of the local branch, as after update-branch', () => {
  const local = 'e'.repeat(40);
  const merged = pr({ headRefName: 'topic', headRefOid: 'd'.repeat(40) }); // GitHub merged the base: green on a head the worktree lacks
  const lines = []; const log = console.log; console.log = line => lines.push(JSON.parse(line));
  let clock = 0;
  try {
    const code = waitCommand(['5', '--until', 'ci', '--timeout', '3'], lanes, { read: () => merged, readFresh: () => merged, localHead: () => local, remoteAhead: (tip, remote) => tip === local && remote === merged.headRefOid, pause: () => { clock += 60_000; }, now: () => clock });
    assert.equal(code, 0, 'a remote head that descends from the local tip is not stale');
    assert.equal(lines.at(-1).head, merged.headRefOid);
  } finally { console.log = log; }
});

test('a Measured: result posts once per issue and a rerun edits that comment', () => {
  const comments = [{ id: 1, body: 'Plan' }];
  const run = args => {
    const patch = args.includes('PATCH');
    const body = args.find(arg => arg.startsWith('body='))?.slice(5);
    if (args.includes('--paginate')) return [comments];
    if (!patch) { comments.push({ id: comments.length + 1, body }); return { id: comments.length }; }
    const target = comments.find(c => args.includes(`repos/acme/app/issues/comments/${c.id}`));
    target.body = body;
    return { id: target.id };
  };
  assert.deepEqual(postIssueComment('acme/app', 7, 'Measured: 3 bugs', run), { id: 2, edited: false });
  assert.deepEqual(postIssueComment('acme/app', 7, 'Measured: 5 bugs', run), { id: 2, edited: true });
  assert.deepEqual(comments.map(c => c.body), ['Plan', 'Measured: 5 bugs']);
  postIssueComment('acme/app', 7, 'Other note', run);
  postIssueComment('acme/app', 7, 'Other note', run);
  assert.equal(comments.length, 4, 'only a Measured: result is edited in place');
});

test('notBefore is the latest of a stated date and the blockers merge time plus the wait days', () => {
  const deps = [{ number: 4, mergedAt: '2026-11-20T10:00:00Z' }, { number: 5, mergedAt: '2026-11-22T10:00:00Z' }, { number: 6 }];
  assert.equal(notBefore('', deps), null);
  assert.equal(notBefore('<!-- workflow:not-before 2026-12-25T00:00:00Z -->', []), '2026-12-25T00:00:00.000Z');
  assert.equal(notBefore('<!-- workflow:wait-days 7 -->', deps), '2026-11-29T10:00:00.000Z', 'seven days after the last merge');
  assert.equal(notBefore('<!-- workflow:wait-days 7 -->', []), null, 'no merge time, no date');
  assert.equal(notBefore('<!-- workflow:wait-days 7 --><!-- workflow:not-before 2026-12-25T00:00:00Z -->', deps), '2026-12-25T00:00:00.000Z');
});
