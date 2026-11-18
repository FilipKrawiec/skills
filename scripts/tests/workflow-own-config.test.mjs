import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertDistinctPushRoles, validConfigShape, codeownersRolesFrom, validateWorkflowSteps } from '../../plugins/common/workflow/scripts/lib/core.mjs';
import { validateCodeowners } from '../../plugins/common/workflow/scripts/safety.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const repo = 'FilipKrawiec/skills';

test("this repository's committed config and CODEOWNERS resolve implementer, Reviewer and Owner through the CLI's own resolution", () => {
  const raw = JSON.parse(read('.agents/config.json'));
  const roles = codeownersRolesFrom(read('.github/CODEOWNERS'), repo, raw.identities?.owner);
  assert.notEqual(roles.ownerInferred, true, 'identities.owner must be set explicitly in .agents/config.json');
  assert.ok(raw.identities.owner && roles.owner === raw.identities.owner);
  assert.ok(roles.defaultReviewer, 'CODEOWNERS names one default Reviewer');
  assert.equal(raw.identities.reviewer?.toLowerCase(), roles.defaultReviewer.toLowerCase());
  assert.ok(raw.identities.implementer);
  assert.equal(validConfigShape(raw), true, 'config() would reject this .agents/config.json');
  const cfg = { owner: roles.owner, implementer: raw.identities.implementer, reviewer: roles.defaultReviewer };
  assert.doesNotThrow(() => assertDistinctPushRoles(cfg));
  assert.doesNotThrow(() => validateWorkflowSteps(raw.steps));
  assert.equal(validateCodeowners(roles.contents, cfg), true);
});

test('the config shape check rejects another version, an explore block and non-object sections', () => {
  const good = { version: 1, identities: {}, steps: {} };
  assert.equal(validConfigShape(good), true);
  for (const bad of [{ ...good, version: 2 }, { ...good, explore: {} }, { ...good, steps: [] }, [], null]) assert.equal(validConfigShape(bad), false);
});
