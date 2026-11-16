import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyConsolidatedDelivery } from '../../plugins/common/workflow/scripts/lib/consolidated-delivery.mjs';
import { verifyEpicClosure } from '../../plugins/common/workflow/scripts/lib/epic-closure.mjs';
import { resolveNativeEpicEvidence } from '../../plugins/common/workflow/scripts/lib/epic-attestation.mjs';

const pr = 'https://github.com/a/b/pull/12';
function fixture(over = {}) {
  const outcome = { criterion: { id: 'a', text: 'Works' }, state: 'met', explanation: 'The evidence shows it.', evidence: [pr], ...over };
  const epic = { number: 9, body: '### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n' };
  const slices = [{ number: 10, state: 'CLOSED' }];
  const packet = { version: 1, epic: 9, children: [10], outcomes: [outcome] };
  const adapters = { native: () => packet, lookup: (repo, n) => ({ number: n, pr: true, merged: true, base: 'main' }), merged: () => true };
  return { epic, slices, packet, outcome, adapters, check: () => verifyEpicClosure({ epic, slices, repo: 'a/b', base: 'main' }, adapters) };
}

test('closure completes with a current Reviewer outcome and merged children', () => {
  assert.equal(fixture().check().complete, true);
});

test('closure stops on a stale criterion, an unlisted child, an open child or a child without a merged PR', () => {
  for (const mutate of [
    f => { f.epic.body = f.epic.body.replace('Works', 'Changed'); },
    f => { f.slices.push({ number: 11, state: 'CLOSED' }); },
    f => { f.slices[0].state = 'OPEN'; },
    f => { f.adapters.merged = () => false; },
    f => { f.epic.body = f.epic.body.replace('[x]', '[ ]'); },
    f => { f.adapters.native = () => { throw Error('no review'); }; },
  ]) { const f = fixture(); mutate(f); assert.equal(f.check().complete, false); }
});

test('outcomes need an explanation and evidence links', () => {
  for (const over of [{ explanation: '  ' }, { explanation: undefined }, { evidence: [] }, { evidence: ['not a url'] }]) assert.equal(fixture(over).check().complete, false);
});

test('cited PRs must exist in the repository and be merged into the base; other links and content are not checked', () => {
  const f = fixture();
  f.adapters.lookup = () => null; assert.equal(f.check().complete, false);
  f.adapters.lookup = (repo, n) => ({ number: n, pr: false }); assert.equal(f.check().complete, false, 'an issue where a PR is cited');
  f.adapters.lookup = (repo, n) => ({ number: n, pr: true, merged: false, base: 'main' }); assert.equal(f.check().complete, false);
  f.adapters.lookup = (repo, n) => ({ number: n, pr: true, merged: true, base: 'dev' }); assert.equal(f.check().complete, false);
  const issue = fixture({ evidence: ['https://github.com/a/b/issues/3', 'https://example.org/anything'] });
  issue.adapters.lookup = (repo, n) => ({ number: n, pr: false });
  assert.equal(issue.check().complete, true);
  const other = fixture({ evidence: ['https://github.com/other/repo/pull/1'] });
  other.adapters.lookup = () => { throw Error('must not look up'); };
  assert.equal(other.check().complete, true);
});

test('unmet outcomes keep the epic open with a concrete follow-up', () => {
  const result = fixture({ state: 'unmet', nextAction: 'Fix the gap' }).check();
  assert.equal(result.complete, false);
  assert.deepEqual(result.outstanding, [{ id: 'a', text: 'Works', nextAction: 'Fix the gap' }]);
  assert.equal(fixture({ state: 'unverifiable' }).check().complete, false, 'no next action, no follow-up');
});

const cfg = { repo: 'a/b', reviewer: 'reviewer', implementer: 'builder' };
const comment = (login, time, extra = {}) => ({ user: { login }, created_at: time, body: JSON.stringify({ kind: 'workflow:epic-outcomes', version: 1, ...extra }) });

test('the newest outcome comment by the configured Reviewer is current; an edit or older comment does not matter', () => {
  const comments = () => [comment('reviewer', '2026-01-02T00:00:00Z', { n: 2 }), comment('reviewer', '2026-01-01T00:00:00Z', { n: 1 }), comment('builder', '2026-01-03T00:00:00Z', { n: 3 })];
  const resolve = (adapters = {}) => resolveNativeEpicEvidence({ repo: 'a/b', issue: 9 }, { trustedConfig: () => cfg, comments, ...adapters });
  assert.equal(resolve().n, 2);
  assert.throws(() => resolve({ comments: () => [comment('builder', '2026-01-03T00:00:00Z')] }));
  assert.throws(() => resolve({ trustedConfig: () => ({ ...cfg, implementer: 'reviewer' }) }));
  assert.throws(() => resolve({ comments: () => { throw Error('unavailable'); } }));
});

test('consolidated delivery needs the Reviewer to name a merged PR; the issue body may change', () => {
  const child = { number: 10, state: 'CLOSED', body: 'anything' };
  const packet = { version: 1, epic: 9, consolidated: [{ issue: 10, pr: 25, state: 'met' }] };
  const adapters = { native: () => packet, mergedPr: (number, base) => number === 25 && base === 'main' };
  const check = () => verifyConsolidatedDelivery({ epic: 9, child, repo: 'a/b', base: 'main' }, adapters);
  assert.equal(check(), true);
  child.body += ' edited'; assert.equal(check(), true);
  adapters.mergedPr = () => false; assert.equal(check(), false); adapters.mergedPr = () => true;
  packet.consolidated.push(packet.consolidated[0]); assert.equal(check(), false); packet.consolidated.pop();
  packet.consolidated[0].state = 'unmet'; assert.equal(check(), false);
  adapters.native = () => { throw Error('unavailable'); }; assert.equal(check(), false);
});
