import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyEpicClosure } from '../../plugins/common/workflow/scripts/lib/epic-closure.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
function fixture() {
  const manifestUrl = 'https://raw.githubusercontent.com/a/b/main/manifest.json';
  const recordsUrl = 'https://raw.githubusercontent.com/a/b/main/records.json';
  const manifest = { version: 1, epic: 9, criteria: [{ id: 'a', text: 'Works', requiredSlices: [10, 99] }] };
  const manifestBytes = () => Buffer.from(JSON.stringify(manifest));
  const record = { version: 2, criterion: { id: 'a', text: 'Works' }, state: 'met', explanation: 'Delivered', author: 'builder', verificationCommentId: 123, evidence: [{ id: 'manifest', url: manifestUrl, sha256: sha(manifestBytes()) }] };
  const epic = { number: 9, body: `<!-- workflow:epic-manifest ${manifestUrl} -->\n<!-- workflow:epic-records ${recordsUrl} -->\n### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n` };
  const slices = [{ number: 10, state: 'CLOSED' }, { number: 99, state: 'CLOSED' }];
  const adapters = { read: url => url === manifestUrl ? manifestBytes() : Buffer.from(JSON.stringify({ version: 2, epic: 9, records: [record] })), attest: ({ criterion, evidence }) => ({ reviewer: 'reviewer', criterion, evidence }), merged: () => true };
  return { epic, slices, manifest, record, adapters, check: () => verifyEpicClosure({ epic, slices, repo: 'a/b', base: 'main' }, adapters) };
}

test('closure validates current criteria, full slice inventory and authenticated content', () => {
  const f = fixture();
  assert.equal(f.check().complete, true);
  f.manifest.criteria[0].requiredSlices.pop();
  assert.equal(f.check().complete, false, 'unmapped child');
  f.manifest.criteria[0].requiredSlices = [10, 99, 101];
  assert.equal(f.check().complete, false, 'unlinked slice');
  f.manifest.criteria[0].requiredSlices = [10, 99];
  f.epic.body = f.epic.body.replace('Works', 'Changed');
  assert.equal(f.check().complete, false, 'changed criterion');
});

test('closure fails on changed content, stale attestation, retrieval failure or missing merge', () => {
  for (const mutate of [
    f => { f.record.evidence[0].sha256 = '0'.repeat(64); },
    f => { f.adapters.attest = () => { throw Error('edited'); }; },
    f => { f.adapters.read = () => { throw Error('unavailable'); }; },
    f => { f.adapters.merged = () => false; },
    f => { f.slices[0].state = 'OPEN'; },
  ]) { const f = fixture(); mutate(f); assert.equal(f.check().complete, false); }
});

test('unmet criteria retain concrete follow-up instructions', () => {
  const f = fixture(); f.record.state = 'unmet'; f.record.nextAction = 'Fix the gap';
  const result = f.check();
  assert.equal(result.complete, false);
  assert.deepEqual(result.outstanding, [{ id: 'a', text: 'Works', nextAction: 'Fix the gap' }]);
});
