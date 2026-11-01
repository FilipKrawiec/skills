import test from 'node:test';
import assert from 'node:assert/strict';
import { rulesetOkay, validateCodeowners } from '../../plugins/common/workflow/scripts/safety.mjs';

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
