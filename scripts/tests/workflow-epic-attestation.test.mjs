import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEpicVerification } from '../../plugins/common/workflow/scripts/lib/epic-attestation.mjs';

const criterion = { id: 'c1', text: 'Works' };
const evidence = [{ id: 'e1', url: 'https://example.org/e', sha256: 'a'.repeat(64) }];
const payload = { version: 1, criterion, evidence };
const comment = { id: 5, node_id: 'node5', user: { login: 'Reviewer' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', body: JSON.stringify(payload) };
const input = { repo: 'acme/app', issue: 12, commentId: 5, criterion, evidence };
const deps = { trustedConfig: () => ({ repo: 'acme/app', reviewer: 'reviewer', implementer: 'builder' }), comments: () => [comment], editState: () => ({ id: 'node5', lastEditedAt: null }) };
const resolve = (patch = {}, overrides = {}) => resolveEpicVerification({ ...input, ...patch }, { ...deps, ...overrides });

test('resolves the GitHub author and exact content', () => {
  assert.deepEqual(resolve(), { reviewer: 'Reviewer', criterion, evidence });
});

test('rejects untrusted, edited, ambiguous, stale, malformed or inaccessible attestations', () => {
  const bad = [
    { ...comment, user: { login: 'builder' }, body: JSON.stringify({ ...payload, reviewer: 'reviewer' }) },
    { ...comment, user: null },
    { ...comment, updated_at: '2026-01-02T00:00:00Z' },
    { ...comment, body: '{' },
    { ...comment, body: JSON.stringify({ ...payload, version: 2 }) },
    { ...comment, body: JSON.stringify({ ...payload, criterion: { ...criterion, text: 'Changed' } }) },
    { ...comment, body: JSON.stringify({ ...payload, evidence: [{ ...evidence[0], sha256: 'b'.repeat(64) }] }) },
  ];
  for (const value of bad) assert.throws(() => resolve({}, { comments: () => [value] }));
  assert.throws(() => resolve({}, { editState: () => ({ id: 'node5', lastEditedAt: '2026-01-01T00:00:00Z' }) }));
  assert.throws(() => resolve({}, { editState: () => { throw Error('API failure'); } }));
  assert.throws(() => resolve({}, { comments: () => [] }));
  assert.throws(() => resolve({}, { comments: () => [comment, comment] }));
  assert.throws(() => resolve({}, { comments: () => { throw Error('API failure'); } }));
  for (const config of [{}, { repo: 'acme/app', reviewer: 'reviewer', implementer: 'REVIEWER' }, { repo: 'other/app', reviewer: 'reviewer', implementer: 'builder' }]) assert.throws(() => resolve({}, { trustedConfig: () => config }));
  assert.throws(() => resolve({}, { trustedConfig: () => { throw Error('fetch failed'); } }));
});
