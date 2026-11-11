import test from 'node:test';
import assert from 'node:assert/strict';
import { branchRulesetBypassOkay, effectiveBranchPolicy, rulesetOkay, validateCodeowners } from '../../plugins/common/workflow/scripts/safety.mjs';

const roles = { owner: 'alice', reviewer: 'reviewer' };
const validRuleset = {
  conditions: { ref_name: { include: ['refs/tags/v*', 'refs/tags/rc/*'], exclude: [] } },
  bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5 }, { actor_type: 'Integration', actor_id: 4242 }],
  rules: ['creation', 'update', 'deletion'].map(type => ({ type })),
};

test('CODEOWNERS allows reviewer defaults and owner-only held paths', () => {
  assert.equal(validateCodeowners('* @reviewer\n/.github/workflows/ @alice\n', roles), true);
});

test('CODEOWNERS rejects alternatives, unknown owners and owner-only defaults', () => {
  for (const contents of ['/.github/ @reviewer\n', '* @alice\n', '* @reviewer\n/docs/ @other\n', '* @reviewer @alice\n']) {
    assert.equal(validateCodeowners(contents, roles), false, contents);
  }
});

test('release rulesets allow admins and the configured versioning app only', () => {
  assert.equal(rulesetOkay(validRuleset, 4242), true);
  assert.equal(rulesetOkay(validRuleset, 77), false);
  assert.equal(rulesetOkay({ ...validRuleset, bypass_actors: [...validRuleset.bypass_actors, { actor_type: 'Integration', actor_id: 15368 }] }, 4242), false);
});

test('branch policy reads rulesets as well as classic protection', () => {
  const rules = [
    { type: 'pull_request', parameters: { required_approving_review_count: 1, require_code_owner_review: true, require_last_push_approval: true, dismiss_stale_reviews_on_push: true, required_review_thread_resolution: true } },
    { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'verify' }] } },
    { type: 'required_linear_history' }, { type: 'non_fast_forward' }, { type: 'deletion' },
  ];
  assert.deepEqual(effectiveBranchPolicy(null, rules), {
    reviews: [1, true, true, true], checks: ['verify'], strictChecks: [], linearHistory: true, conversationResolution: true, forcePushesBlocked: true, deletionsBlocked: true, enforceAdmins: null,
  });
  const classic = {
    required_pull_request_reviews: { required_approving_review_count: 1, require_code_owner_reviews: true, require_last_push_approval: true, dismiss_stale_reviews: true },
    required_status_checks: { contexts: ['verify'] }, required_linear_history: { enabled: true }, required_conversation_resolution: { enabled: true },
    allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, enforce_admins: { enabled: false },
  };
  assert.deepEqual(effectiveBranchPolicy(classic, []), {
    reviews: [1, true, true, true], checks: ['verify'], strictChecks: [], linearHistory: true, conversationResolution: true, forcePushesBlocked: true, deletionsBlocked: true, enforceAdmins: false,
  });
  assert.equal(effectiveBranchPolicy(null, []), null);
});

test('branch policy merges classic protection with rulesets', () => {
  const classic = { required_status_checks: { contexts: ['lint'] }, allow_force_pushes: { enabled: true }, allow_deletions: { enabled: false }, enforce_admins: { enabled: false } };
  const rules = [
    { type: 'pull_request', parameters: { required_approving_review_count: 1, require_code_owner_review: false, require_last_push_approval: true, dismiss_stale_reviews_on_push: true } },
    { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'verify' }] } },
    { type: 'non_fast_forward' },
  ];
  const policy = effectiveBranchPolicy(classic, rules);
  assert.deepEqual(policy.reviews, [1, false, true, true]);
  assert.deepEqual(policy.checks, ['lint', 'verify']);
  assert.equal(policy.forcePushesBlocked, true);
  assert.equal(policy.deletionsBlocked, true);
  assert.equal(policy.linearHistory, false);
});

test('branch policy identifies checks protected by up-to-date enforcement', () => {
  const classic = { required_status_checks: { strict: true, contexts: ['lint'] } };
  const rules = [{ type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'verify' }] } },
    { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: 'other' }] } }];
  assert.deepEqual(effectiveBranchPolicy(classic, rules).strictChecks, ['lint', 'verify']);
  assert.deepEqual(effectiveBranchPolicy({ required_status_checks: { strict: false, contexts: ['lint'] } }, []).strictChecks, []);
});

test('branch rulesets may be bypassed by admins only', () => {
  assert.equal(branchRulesetBypassOkay({ bypass_actors: [] }), true);
  assert.equal(branchRulesetBypassOkay({ bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5 }, { actor_type: 'OrganizationAdmin', actor_id: 1 }] }), true);
  assert.equal(branchRulesetBypassOkay({ bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 4 }] }), false);
  assert.equal(branchRulesetBypassOkay({ bypass_actors: [{ actor_type: 'Integration', actor_id: 99 }] }), false);
  assert.equal(branchRulesetBypassOkay({}), null);
  assert.equal(branchRulesetBypassOkay(null), null);
});
