import test from 'node:test';
import assert from 'node:assert/strict';
import { ciState, nextCommand, prState, statusCommand, waitCommand } from '../../plugins/common/workflow/scripts/lib/state.mjs';

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
  assert.deepEqual(next({ labels: [{ name: 'risk:R2' }], reviews: [review('ready', 'APPROVED')] }), { action: 'owner-review', actor: 'owner', reason: 'risk R2' });
  assert.equal(next({ labels: [{ name: 'risk:R1' }], reviews: [review('ready', 'APPROVED')] }).action, 'merge');
  assert.equal(next({ isDraft: true, labels: [{ name: 'risk:R2' }], reviews: [review('ready')] }).action, 'ready', 'an R2 draft is readied, not handed to the owner');
  assert.equal(next({ labels: [{ name: 'risk:R2' }], reviews: [review('ready')] }).actor, 'reviewer', 'an unapproved R2 PR waits for the approval');
  assert.equal(next({ labels: [{ name: 'review:owner' }], reviews: [review('fixes')] }).actor, 'implementer', 'an owner hold never skips the fixes');
  assert.equal(next({ reviews: [review('fixes'), review('fixes'), review('fixes')] }).actor, 'implementer', 'no round count asks the owner');
  assert.equal(next({ reviews: [review('cap')] }).actor, 'reviewer', 'a retired cap verdict is not an approval');
  assert.deepEqual(next({ labels: [{ name: 'review:owner' }], reviews: [review('owner', 'APPROVED')] }), { action: 'owner-review', actor: 'owner', reason: 'review:owner' });
  const ownerApproved = { author: { login: 'owner' }, state: 'APPROVED', body: '', commit: { oid: head } };
  assert.equal(next({ labels: [{ name: 'risk:R2' }], reviews: [review('ready', 'APPROVED'), ownerApproved] }).action, 'merge');
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

test('wait refuses an unknown condition', () => {
  assert.throws(() => waitCommand(['5', '--until', 'forever'], lanes), /Usage: wait/);
});

// A fake `gh`: each issue is { state, reason, body, labels, blockedBy, subs }.
function fakeGh(issues, prs = []) {
  return args => {
    const [kind, path] = args;
    const key = args.join(' ');
    const at = /issues\/(\d+)/.exec(path || '')?.[1];
    if (kind === 'api' && path.endsWith('/blocked_by')) return (issues[at].blockedBy || []).map(number => ({ number }));
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
