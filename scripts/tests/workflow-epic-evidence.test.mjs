import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateEpicEvidence } from '../../plugins/common/workflow/scripts/lib/epic-evidence.mjs';

const criterion = { id: 'c1', text: 'Users can sign in', checked: true };
const evidence = { id: 'e1', url: 'https://example.com/e1', type: 'http-body', bytes: Buffer.from('proof') };
const ref = { id: evidence.id, url: evidence.url, sha256: createHash('sha256').update(evidence.bytes).digest('hex') };
const record = { version: 2, author: 'author', criterion: { id: 'c1', text: 'Users can sign in' }, state: 'met', evidence: [ref], explanation: 'A reviewer observed a successful sign-in.', verification: { reviewer: 'reviewer', criterion: { id: 'c1', text: 'Users can sign in' }, evidence: [ref] } };
const validate = (criteria = [criterion], records = [record], availableEvidence = [evidence]) => validateEpicEvidence({ criteria, records, evidence: availableEvidence });

test('complete independently verified evidence validates', () => {
  assert.equal(validate().complete, true);
});

test('missing, unchecked, duplicate and stale criteria fail closed', () => {
  for (const result of [validate([criterion], []), validate([{ ...criterion, checked: false }]), validate([criterion], [record, record]), validate([{ ...criterion, text: 'Changed' }])]) assert.equal(result.complete, false);
});

test('malformed, inaccessible, ambiguous and stale evidence or verification fails closed', () => {
  for (const result of [validate([criterion], [{ ...record, version: 1 }]), validate([criterion], [{ ...record, explanation: '' }]), validate([criterion], [record], [{ ...evidence, bytes: null }]), validate([criterion], [record], [evidence, evidence]), validate([criterion], [{ ...record, evidence: [{ id: 'missing', url: 'https://example.com/missing' }] }]), validate([criterion], [{ ...record, verification: { ...record.verification, evidence: [{ id: 'other', url: 'https://example.com/other' }] } }]), validate([criterion], [{ ...record, verification: { ...record.verification, criterion: { ...record.criterion, text: 'Old' } } }]), validate([criterion], [{ ...record, verification: { ...record.verification, reviewer: '' } }])]) assert.equal(result.complete, false);
});

test('unmet and unverifiable criteria require a next action and linked follow-up, and remain incomplete', () => {
  for (const state of ['unmet', 'unverifiable']) {
    const result = validate([criterion], [{ ...record, state, nextAction: 'Investigate the failure', followUp: 'https://example.com/issues/1' }]);
    assert.equal(result.complete, false);
    assert.ok(result.issues.some(issue => issue.includes('Investigate the failure')));
    assert.equal(validate([criterion], [{ ...record, state }]).complete, false);
  }
});

test('null criterion and record fail closed without throwing', () => {
  const result = validate([null], [null], []);
  assert.equal(result.complete, false);
  assert.ok(result.issues.length > 0);
});

 test('content identity and reviewer bind to the current retrieved version', () => {
  const changed = { ...evidence, bytes: Buffer.from('changed proof') };
  const changedRef = { ...ref, sha256: createHash('sha256').update(changed.bytes).digest('hex') };
  for (const result of [
    validate([criterion], [record], [changed]),
    validate([criterion], [{ ...record, evidence: [changedRef] }], [changed]),
    validate([criterion], [{ ...record, verification: { ...record.verification, reviewer: record.author } }]),
    validate([criterion], [record], [{ ...evidence, type: 'html-render' }]),
    validate([criterion], [record], []),
    validate([criterion], [{ ...record, evidence: [{ ...ref, sha256: 'invalid' }] }]),
  ]) assert.equal(result.complete, false);
});
