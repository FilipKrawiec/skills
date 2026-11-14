// Version 1 records bind verification to exact criterion text and evidence identities.
// Callers must establish accessibility and supply current evidence, not cached claims.
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const url = value => { try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; } };
const unique = values => new Set(values).size === values.length;
const sameCriterion = (a, b) => a && b && a.id === b.id && a.text === b.text;
const sameEvidence = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && unique(a.map(x => x?.id)) && a.every(x => b.some(y => x?.id === y?.id && x?.url === y?.url));

/** Validate version 1 records against current criteria and independently checked evidence.
 * Verification is an attestation, not proof that the explanation is true.
 * Returns { complete, issues }; malformed inputs always produce an incomplete result.
 */
export function validateEpicEvidence(input) {
  const issues = [];
  const fail = message => issues.push(message);
  const criteria = input?.criteria, records = input?.records, evidence = input?.evidence;
  if (![criteria, records, evidence].every(Array.isArray)) return { complete: false, issues: ['Expected criteria, records and evidence arrays'] };
  if (!criteria.length) fail('No acceptance criteria');
  if (!unique(criteria.map(c => c?.id))) fail('Duplicate criteria');
  if (!unique(records.map(r => r?.criterion?.id))) fail('Duplicate records');
  if (!unique(evidence.map(e => e?.id))) fail('Ambiguous evidence');
  for (const item of evidence) if (!nonempty(item?.id) || !url(item?.url) || item.accessible !== true) fail('Malformed or inaccessible evidence');
  for (const record of records) if (!criteria.some(c => sameCriterion(c, record?.criterion))) fail('Stale or unknown record');
  for (const criterion of criteria) {
    if (!nonempty(criterion?.id) || !nonempty(criterion?.text) || criterion.checked !== true) fail('Missing or unchecked criterion');
    const matches = records.filter(r => r?.criterion?.id === criterion?.id);
    if (matches.length !== 1) { fail('Criterion requires exactly one record'); continue; }
    const record = matches[0];
    if (record.version !== 1 || !sameCriterion(criterion, record.criterion) || !['met', 'unmet', 'unverifiable'].includes(record.state) || !nonempty(record.explanation)) fail('Malformed or stale record');
    const refs = record.evidence;
    if (!Array.isArray(refs) || !refs.length || !unique(refs.map(e => e?.id)) || refs.some(ref => !nonempty(ref?.id) || !url(ref?.url) || evidence.filter(e => e?.id === ref.id && e?.url === ref.url && e?.accessible === true).length !== 1)) fail('Missing, stale or inaccessible evidence');
    const verification = record.verification;
    if (!nonempty(verification?.reviewer) || !sameCriterion(criterion, verification?.criterion) || !sameEvidence(refs, verification?.evidence)) fail('Missing or mismatched independent verification');
    if (record.state !== 'met') {
      if (!nonempty(record.nextAction) || !url(record.followUp)) fail('Incomplete criterion requires a next action and linked follow-up');
      fail(`Criterion ${criterion?.id} is ${record.state}: ${record.nextAction || 'next action required'}${record.followUp ? ` (${record.followUp})` : ''}`);
    }
  }
  return { complete: issues.length === 0, issues };
}
