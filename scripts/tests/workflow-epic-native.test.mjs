import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyConsolidatedDelivery } from '../../plugins/common/workflow/scripts/lib/consolidated-delivery.mjs';
import { verifyEpicClosure } from '../../plugins/common/workflow/scripts/lib/epic-closure.mjs';

test('native reviewer evidence closes only with current complete work', () => {
  const bytes = Buffer.from('evidence');
  const epic = { number: 9, body: '### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n' };
  const slices = [{ number: 10, state: 'CLOSED' }];
  const packet = { version: 1, epic: 9, children: [10], outcomes: [{ criterion: { id: 'a', text: 'Works' }, state: 'met', explanation: 'The evidence demonstrates the outcome.', evidence: [{ url: 'https://example.org/evidence', sha256: createHash('sha256').update(bytes).digest('hex') }] }] };
  const adapters = { native: () => packet, read: () => bytes, merged: () => true };
  const check = () => verifyEpicClosure({ epic, slices, repo: 'a/b', base: 'main' }, adapters);
  assert.equal(check().complete, true);
  epic.body = epic.body.replace('Works', 'Changed');
  assert.equal(check().complete, false);
  epic.body = epic.body.replace('Changed', 'Works');
  slices.push({ number: 11, state: 'OPEN' });
  assert.equal(check().complete, false);
  slices.pop();
  adapters.read = () => Buffer.from('changed');
  assert.equal(check().complete, false);
  adapters.read = () => { throw Error('unavailable'); };
  assert.equal(check().complete, false);
  adapters.read = () => bytes;
  adapters.merged = () => false;
  assert.equal(check().complete, false);
  adapters.merged = () => true;
  adapters.native = () => { throw Error('independent review missing'); };
  assert.equal(check().complete, false);
});

test('native outcomes require a reviewer explanation', () => {
  const bytes = Buffer.from('proof');
  const outcome = { criterion: { id: 'a', text: 'Works' }, state: 'met', evidence: [{ url: 'https://example.org/proof', sha256: createHash('sha256').update(bytes).digest('hex') }] };
  const check = () => verifyEpicClosure({ epic: { number: 9, body: '### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n' }, slices: [{ number: 10, state: 'CLOSED' }], repo: 'a/b', base: 'main' }, { native: () => ({ version: 1, epic: 9, children: [10], outcomes: [outcome] }), read: () => bytes, merged: () => true });
  assert.equal(check().complete, false);
  outcome.explanation = '   '; assert.equal(check().complete, false);
  outcome.explanation = 'The linked proof demonstrates the outcome.'; assert.equal(check().complete, true);
});

import { resolveNativeEpicEvidence } from '../../plugins/common/workflow/scripts/lib/epic-attestation.mjs';
test('native assessment requires one unedited comment from the independent reviewer', () => {
  const item = { node_id: 'node', user: { login: 'reviewer' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', body: JSON.stringify({ kind: 'workflow:epic-outcomes', version: 1 }) };
  const adapters = { trustedConfig: () => ({ repo: 'a/b', reviewer: 'reviewer', implementer: 'builder' }), comments: () => [item], editState: () => ({ id: 'node', lastEditedAt: null }) };
  const resolve = () => resolveNativeEpicEvidence({ repo: 'a/b', issue: 9 }, adapters);
  assert.equal(resolve().version, 1);
  item.user.login = 'builder'; assert.throws(resolve); item.user.login = 'reviewer';
  adapters.editState = () => ({ id: 'node', lastEditedAt: '2026-01-01' }); assert.throws(resolve);
  adapters.editState = () => ({ id: 'node', lastEditedAt: null });
  adapters.comments = () => [item, item]; assert.throws(resolve);
  adapters.comments = () => { throw Error('unavailable'); }; assert.throws(resolve);
});

test('incomplete native outcomes produce verified actionable follow-ups', () => {
  const bytes = Buffer.from('proof');
  const outcome = { criterion: { id: 'a', text: 'Works' }, state: 'unmet', explanation: 'The evidence shows the remaining gap.', nextAction: 'Fix the gap', evidence: [{ url: 'https://example.org/proof', sha256: createHash('sha256').update(bytes).digest('hex') }] };
  const result = verifyEpicClosure({ epic: { number: 9, body: '### Acceptance criteria\n- [ ] Works <!-- workflow:criterion a -->\n' }, slices: [{ number: 10, state: 'CLOSED' }], repo: 'a/b', base: 'main' }, { native: () => ({ version: 1, epic: 9, children: [10], outcomes: [outcome] }), read: () => bytes, merged: () => true });
  assert.equal(result.complete, false);
  assert.deepEqual(result.outstanding, [{ id: 'a', text: 'Works', nextAction: 'Fix the gap' }]);
});

test('consolidated delivery requires authenticated current child and merged PR evidence', () => {
  const child = { number: 10, state: 'CLOSED', body: '### Acceptance criteria\n- [x] Delivered' };
  const packet = { version: 1, epic: 9, consolidated: [{ issue: 10, bodySha256: createHash('sha256').update(child.body).digest('hex'), pr: 25, state: 'met' }] };
  const adapters = { native: () => packet, mergedPr: (number, base) => number === 25 && base === 'main' };
  const check = () => verifyConsolidatedDelivery({ epic: 9, child, repo: 'a/b', base: 'main' }, adapters);
  assert.equal(check(), true);
  child.body += ' changed'; assert.equal(check(), false); child.body = child.body.replace(' changed', '');
  adapters.mergedPr = () => false; assert.equal(check(), false); adapters.mergedPr = () => true;
  packet.consolidated.push(packet.consolidated[0]); assert.equal(check(), false); packet.consolidated.pop();
  packet.consolidated[0].state = 'unmet'; assert.equal(check(), false);
  adapters.native = () => { throw Error('unavailable'); }; assert.equal(check(), false);
});

