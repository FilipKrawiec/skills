import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prAutoMergeRefusal, prReadyRefusal } from '../../plugins/common/workflow/scripts/lib/pr.mjs';
import { fixture } from './support/workflow-cli-fixture.mjs';

const head = 'a'.repeat(40);
const cfg = { repo: 'acme/app', base: 'main', implementer: 'builder', reviewer: 'reviewer', owner: 'owner', requiredChecks: ['verify'] };
const verdict = (mode, value, state, extra = {}) => ({ author: { login: 'reviewer' }, state, body: `<!-- agent-review sha=${head} round=1 mode=${mode} verdict=${value} -->`, commit: { oid: head }, ...extra });
const green = [{ name: 'verify', conclusion: 'SUCCESS' }];
const draft = (extra = {}) => ({ number: 5, state: 'OPEN', isDraft: true, baseRefName: 'main', headRefOid: head, labels: [], mergeable: 'MERGEABLE', statusCheckRollup: green, reviews: [verdict('author', 'ready', 'COMMENTED')], ...extra });
const ready = (extra = {}) => draft({ isDraft: false, reviews: [verdict('team', 'ready', 'APPROVED')], ...extra });
const policy = { reviews: [1, true, true, true], checks: ['verify'] };

test('pr ready accepts a green draft whose newest author verdict at its head is ready', () => {
  assert.equal(prReadyRefusal(draft(), cfg), null);
});

test('pr ready refuses without the author verdict at the head, on red, pending or missing checks, and on a conflict', () => {
  const refusals = {
    'already ready': draft({ isDraft: false }),
    closed: draft({ state: 'CLOSED' }),
    'no verdict': draft({ reviews: [] }),
    'verdict fixes': draft({ reviews: [verdict('author', 'fixes', 'COMMENTED')] }),
    'verdict at an older head': draft({ reviews: [verdict('author', 'ready', 'COMMENTED', { commit: { oid: 'b'.repeat(40) } })] }),
    'newer verdict fixes': draft({ reviews: [verdict('author', 'ready', 'COMMENTED'), verdict('author', 'fixes', 'COMMENTED')] }),
    'outside change request': draft({ reviews: [verdict('author', 'ready', 'COMMENTED'), { author: { login: 'teammate' }, state: 'CHANGES_REQUESTED', body: '', commit: { oid: head } }] }),
    'red check': draft({ statusCheckRollup: [{ name: 'verify', conclusion: 'FAILURE' }] }),
    'pending check': draft({ statusCheckRollup: [{ name: 'verify', status: 'IN_PROGRESS', conclusion: '' }] }),
    'missing required check': draft({ statusCheckRollup: [{ name: 'lint', conclusion: 'SUCCESS' }] }),
    conflict: draft({ mergeable: 'CONFLICTING' }),
    'another base': draft({ baseRefName: 'release' }),
  };
  for (const [name, pr] of Object.entries(refusals)) assert.ok(prReadyRefusal(pr, cfg), name);
});

test('pr auto-merge accepts a Reviewer approval at the head under code-owner protection, and an owner-approved owner lane', () => {
  assert.equal(prAutoMergeRefusal(ready(), cfg, policy), null);
  const owner = ready({ labels: [{ name: 'review:owner' }], reviews: [verdict('team', 'owner', 'APPROVED'), { author: { login: 'owner' }, state: 'APPROVED', body: '', commit: { oid: head } }] });
  assert.equal(prAutoMergeRefusal(owner, cfg, policy), null);
  // Pending checks are left to GitHub, which merges only once they pass.
  assert.equal(prAutoMergeRefusal(ready({ statusCheckRollup: [{ name: 'verify', status: 'QUEUED' }] }), cfg, policy), null);
});

test('pr auto-merge refuses a draft, a missing or stale approval, an owner hold, a red check and missing protection', () => {
  const ownerLane = { labels: [{ name: 'review:owner' }], reviews: [verdict('team', 'owner', 'APPROVED')] };
  const refusals = {
    draft: [ready({ isDraft: true }), policy],
    'author verdict only': [ready({ reviews: [verdict('author', 'ready', 'COMMENTED')] }), policy],
    'approval at an older head': [ready({ reviews: [verdict('team', 'ready', 'APPROVED', { commit: { oid: 'b'.repeat(40) } })] }), policy],
    'verdict owner without the owner lane': [ready({ reviews: [verdict('team', 'owner', 'APPROVED')] }), policy],
    'owner lane without the owner': [ready(ownerLane), policy],
    'owner approved an older head': [ready({ ...ownerLane, reviews: [...ownerLane.reviews, { author: { login: 'owner' }, state: 'APPROVED', commit: { oid: 'b'.repeat(40) } }] }), policy],
    'owner requests changes': [ready({ reviews: [{ author: { login: 'owner' }, state: 'CHANGES_REQUESTED', commit: { oid: 'b'.repeat(40) } }, verdict('team', 'ready', 'APPROVED')] }), policy],
    'red check': [ready({ statusCheckRollup: [{ name: 'verify', conclusion: 'FAILURE' }] }), policy],
    conflict: [ready({ mergeable: 'CONFLICTING' }), policy],
    'another base': [ready({ baseRefName: 'release' }), policy],
    'unreadable protection': [ready(), null],
    'no code-owner review': [ready(), { reviews: [1, false, true, true], checks: ['verify'] }],
    'check not required': [ready(), { reviews: [1, true, true, true], checks: [] }],
  };
  for (const [name, [pr, rules]] of Object.entries(refusals)) assert.ok(prAutoMergeRefusal(pr, cfg, rules), name);
});

function setup(t, view, extra = {}) {
  const f = fixture(t);
  f.env.GH_LOG = join(f.root, 'gh.log');
  f.env.PR_VIEW = JSON.stringify(view);
  f.env.BRANCH_RULES = JSON.stringify([{ type: 'pull_request', parameters: { required_approving_review_count: 1, require_code_owner_review: true } }, { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'verify' }] } }]);
  Object.assign(f.env, extra);
  return { f, log: () => (existsSync(f.env.GH_LOG) ? readFileSync(f.env.GH_LOG, 'utf8').split('\n').filter(Boolean) : []) };
}

test('workflow pr ready marks the draft ready and drops the owner request', t => {
  const { f, log } = setup(t, draft());
  const result = f.cliRun('pr', 'ready', '--pr', '5');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`PR #5 ready for review at ${head}`));
  assert.deepEqual(log(), ['pr ready 5 --repo acme/app', 'pr edit 5 --repo acme/app --remove-reviewer owner']);
});

test('workflow pr ready refuses with the reason and changes nothing', t => {
  const { f, log } = setup(t, draft({ reviews: [] }));
  const result = f.cliRun('pr', 'ready', '--pr', '5');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pr ready refused: no author-mode agent-review verdict=ready/);
  assert.deepEqual(log(), []);
});

test('workflow pr auto-merge binds squash auto-merge to the head and confirms GitHub accepted it', t => {
  const { f, log } = setup(t, ready(), { PR_VIEW_AFTER: JSON.stringify(ready({ autoMergeRequest: { enabledAt: 'now' } })) });
  const result = f.cliRun('pr', 'auto-merge', '--pr', '5');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`PR #5 auto-merge on at ${head}`));
  assert.deepEqual(log(), [`pr merge 5 --repo acme/app --squash --auto --match-head-commit ${head}`]);
});

test('workflow pr auto-merge fails when GitHub did not record auto-merge', t => {
  const { f } = setup(t, ready());
  const result = f.cliRun('pr', 'auto-merge', '--pr', '5');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub did not accept auto-merge for #5/);
});

test('workflow pr auto-merge refuses an owner hold and when protection is unreadable, without merging', t => {
  const held = setup(t, ready({ labels: [{ name: 'review:owner' }], reviews: [verdict('team', 'owner', 'APPROVED')] }));
  const result = held.f.cliRun('pr', 'auto-merge', '--pr', '5');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pr auto-merge refused: review:owner holds it until owner approves/);
  assert.deepEqual(held.log(), []);
  const hidden = setup(t, ready(), { BRANCH_RULES: '' });
  const blind = hidden.f.cliRun('pr', 'auto-merge', '--pr', '5');
  assert.equal(blind.status, 1);
  assert.match(blind.stderr, /does not visibly require code-owner review/);
  assert.deepEqual(hidden.log(), []);
});

test('workflow pr rejects malformed arguments', t => {
  const { f } = setup(t, ready());
  for (const args of [['pr', 'merge', '--pr', '5'], ['pr', 'ready', '--pr', 'x'], ['pr', 'ready', '5'], ['pr', 'ready', '--pr', '5', 'extra']]) {
    const result = f.cliRun(...args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /Usage: pr ready\|auto-merge --pr NUMBER/);
  }
});
