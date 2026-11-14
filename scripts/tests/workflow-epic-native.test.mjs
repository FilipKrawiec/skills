import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyEpicClosure } from '../../plugins/common/workflow/scripts/lib/epic-closure.mjs';

test('native reviewer evidence closes only with current complete work', () => {
  const bytes = Buffer.from('evidence');
  const epic = { number: 9, body: '### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n' };
  const slices = [{ number: 10, state: 'CLOSED' }];
  const packet = { version: 1, epic: 9, children: [10], outcomes: [{ criterion: { id: 'a', text: 'Works' }, state: 'met', evidence: [{ url: 'https://example.org/evidence', sha256: createHash('sha256').update(bytes).digest('hex') }] }] };
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
  const outcome = { criterion: { id: 'a', text: 'Works' }, state: 'unmet', nextAction: 'Fix the gap', evidence: [{ url: 'https://example.org/proof', sha256: createHash('sha256').update(bytes).digest('hex') }] };
  const result = verifyEpicClosure({ epic: { number: 9, body: '### Acceptance criteria\n- [ ] Works <!-- workflow:criterion a -->\n' }, slices: [{ number: 10, state: 'CLOSED' }], repo: 'a/b', base: 'main' }, { native: () => ({ version: 1, epic: 9, children: [10], outcomes: [outcome] }), read: () => bytes, merged: () => true });
  assert.equal(result.complete, false);
  assert.deepEqual(result.outstanding, [{ id: 'a', text: 'Works', nextAction: 'Fix the gap' }]);
});
