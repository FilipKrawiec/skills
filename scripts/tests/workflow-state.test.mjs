import test from 'node:test';
import assert from 'node:assert/strict';
import { ciState, prState, waitCommand } from '../../plugins/common/workflow/scripts/lib/state.mjs';

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

test('a ready verdict without a mode hands a draft to ship and a ready PR to its approval', () => {
  assert.deepEqual(next({ isDraft: true, reviews: [review('ready')] }), { action: 'ready', actor: 'cli', reason: 'verdict ready on a draft' });
  assert.deepEqual(next({ reviews: [review('ready')] }), { action: 'review', actor: 'reviewer' });
  assert.equal(next({ reviews: [review('ready'), review('fixes')] }).actor, 'implementer', 'a later blocking verdict on a ready PR counts');
});

test('an author-mode ready verdict hands a draft off instead of reviewing it again', () => {
  const authorReady = { ...review('ready'), body: `<!-- agent-review sha=${head} round=1 mode=author verdict=ready -->` };
  assert.deepEqual(next({ isDraft: true, reviews: [authorReady] }), { action: 'ready', actor: 'cli', reason: 'verdict ready on a draft' });
});

test('only risk R2 or the round cap brings in the owner', () => {
  assert.deepEqual(next({ labels: [{ name: 'risk:R2' }], reviews: [review('ready', 'APPROVED')] }), { action: 'owner-review', actor: 'owner', reason: 'risk R2' });
  assert.equal(next({ labels: [{ name: 'risk:R1' }], reviews: [review('ready', 'APPROVED')] }).action, 'merge');
  assert.equal(next({ reviews: [review('cap')] }).actor, 'owner');
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
