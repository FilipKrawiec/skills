import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateEpicEvidence } from './epic-evidence.mjs';
import { resolveEpicVerification, resolveEpicRecordAuthor, resolveNativeEpicEvidence } from './epic-attestation.mjs';

const unique = values => new Set(values).size === values.length;
const positive = n => Number.isSafeInteger(n) && n > 0;
const nonempty = s => typeof s === 'string' && s.trim().length > 0;
const fail = message => { throw new Error(message); };

function parseCriteria(body) {
  const section = (body || '').match(/^#{2,4} Acceptance criteria\s*$([\s\S]*?)(?=^#{1,4} |(?![\s\S]))/mi)?.[1];
  if (!section) fail('Missing acceptance criteria');
  const lines = section.split('\n').filter(line => /^\s*[-*] \[[ xX]\]/.test(line));
  const criteria = lines.map(line => {
    const match = line.match(/^\s*[-*] \[([ xX])\] (.+?)\s*<!-- workflow:criterion ([A-Za-z0-9._-]+) -->\s*$/);
    if (!match) fail('Every criterion needs a stable ID');
    return { id: match[3], text: match[2], checked: match[1].toLowerCase() === 'x' };
  });
  return criteria;
}

// curl performs a fresh complete body read; redirects may never leave HTTP(S).
export function retrieveEpicBytes(url) {
  const parsed = new URL(url);
  const result = parsed.protocol === 'https:' && parsed.hostname === 'api.github.com' && parsed.pathname.startsWith('/repos/')
    ? spawnSync('gh', ['api', url], { maxBuffer: 32 * 1024 * 1024 })
    : spawnSync('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=http,https', '--proto-redir', '=http,https', '--max-time', '30', '--', url], { maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0 || result.error || !Buffer.isBuffer(result.stdout)) fail('Evidence retrieval failed');
  return result.stdout;
}

// The manifest is itself evidence for every criterion. All inputs are fetched on each call.
export function verifyEpicClosure({ epic, slices, base, repo }, adapters = {}) {
  const read = adapters.read || retrieveEpicBytes;
  const attest = adapters.attest || resolveEpicVerification;
  const author = adapters.author || resolveEpicRecordAuthor;
  const merged = adapters.merged;
  try {
    if (!(epic.body || '').includes('<!-- workflow:epic-manifest ')) return verifyNative({ epic, slices, base, repo }, { read, merged, native: adapters.native || resolveNativeEpicEvidence });
    const links = [...(epic.body || '').matchAll(/<!-- workflow:epic-(manifest|records) (https?:\/\/[^\s]+) -->/g)];
    if (links.length !== 2 || new Set(links.map(m => m[1])).size !== 2) fail('Exactly one manifest and records URL are required');
    const manifestUrl = links.find(m => m[1] === 'manifest')[2];
    const recordsUrl = links.find(m => m[1] === 'records')[2];
    if (manifestUrl === recordsUrl) fail('Manifest and records URLs must differ');
    for (const link of [manifestUrl, recordsUrl]) {
      const url = new URL(link);
      if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com' || !url.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/`) || url.search || url.hash) fail('Evidence files must be raw files in the configured GitHub repository');
    }
    const manifestBytes = read(manifestUrl);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const recordsBytes = read(recordsUrl);
    const packet = JSON.parse(recordsBytes.toString('utf8'));
    const authorMarkers = [...(epic.body || '').matchAll(/<!-- workflow:epic-record-author ([1-9][0-9]*) -->/g)];
    if (authorMarkers.length !== 1) fail('Exactly one record author comment is required');
    const recordAuthor = author({ repo, issue: epic.number, commentId: Number(authorMarkers[0][1]), recordsUrl, sha256: createHash('sha256').update(recordsBytes).digest('hex') });
    if (!nonempty(recordAuthor)) fail('Unable to authenticate record author');
    if (manifest.version !== 1 || manifest.epic !== epic.number || !Array.isArray(manifest.criteria) || !manifest.criteria.length || packet.version !== 2 || packet.epic !== epic.number || !Array.isArray(packet.records)) fail('Invalid evidence files');
    const criteria = parseCriteria(epic.body);
    if (!criteria.length || !unique(criteria.map(c => c.id)) || !unique(manifest.criteria.map(c => c.id)) || criteria.length !== manifest.criteria.length) fail('Ambiguous criteria');
    for (const c of criteria) {
      const item = manifest.criteria.find(m => m.id === c.id);
      if (!item || item.text !== c.text || !Array.isArray(item.requiredSlices) || !item.requiredSlices.length || !item.requiredSlices.every(positive) || !unique(item.requiredSlices)) fail('Stale or invalid manifest');
    }
    if (packet.records.length !== criteria.length || !unique(packet.records.map(r => r?.criterion?.id)) || packet.records.some(r => !criteria.some(c => c.id === r?.criterion?.id && c.text === r.criterion.text))) fail('Ambiguous or stale records');
    const outstanding = packet.records.filter(r => ['unmet', 'unverifiable'].includes(r.state)).map(r => ({ id: r.criterion.id, text: r.criterion.text, nextAction: r.nextAction }));
    if (outstanding.some(r => !nonempty(r.nextAction))) fail('Incomplete criterion needs a concrete next action');
    const mapped = manifest.criteria.flatMap(c => c.requiredSlices);
    const inventory = slices.map(s => s.number);
    const mismatch = !unique(inventory) || !unique(mapped) || mapped.length !== inventory.length || mapped.some(n => !inventory.includes(n));
    if (mismatch) {
      const extras = slices.filter(s => !mapped.includes(s.number));
      const pending = extras.length && extras.every(s => outstanding.some(c => (s.body || '').includes(`<!-- workflow:epic-follow-up ${epic.number} ${c.id} -->`)));
      if (!pending || mapped.some(n => !inventory.includes(n)) || !unique(mapped)) fail('Slice inventory does not match manifest');
    }
    const refs = new Map();
    const records = packet.records.map(record => {
      if (!Array.isArray(record.evidence) || !record.evidence.some(ref => ref.url === manifestUrl)) fail('Manifest must be evidence for every criterion');
      for (const ref of record.evidence) {
        const prior = refs.get(ref.id);
        if (prior && (prior.url !== ref.url || prior.sha256 !== ref.sha256)) fail('Ambiguous evidence reference');
        refs.set(ref.id, ref);
      }
      if (!positive(record.verificationCommentId)) fail('Missing verification comment');
      const verification = attest({ repo, issue: epic.number, commentId: record.verificationCommentId, criterion: record.criterion, evidence: record.evidence, state: record.state });
      if (typeof record.author !== 'string' || record.author.toLowerCase() !== recordAuthor.toLowerCase()) fail('Record author does not match authenticated GitHub author');
      if (verification.state !== record.state || verification.reviewer.toLowerCase() === recordAuthor.toLowerCase()) fail('Verification is not independent');
      return { ...record, verification };
    });
    const evidence = [...refs.values()].map(ref => ({ id: ref.id, url: ref.url, type: 'http-body', bytes: ref.url === manifestUrl ? manifestBytes : read(ref.url) }));
    // Authenticate every record and its content before using any action. The reviewer attests a
    // separate JSON evidence body binding the criterion to the exact action, avoiding self-hashing records.
    const checked = criteria.map(c => ({ ...c, checked: true }));
    const met = records.map(r => ({ ...r, state: 'met' }));
    const validated = validateEpicEvidence({ criteria: checked, records: met, evidence });
    if (!validated.complete) fail(`Untrusted action or evidence: ${validated.issues.join('; ')}`);
    for (const action of outstanding) {
      const record = records.find(r => r.criterion.id === action.id);
      const bound = record.evidence.some(ref => {
        try {
          const data = JSON.parse(evidence.find(item => item.id === ref.id).bytes.toString('utf8'));
          return data.version === 1 && data.criterion?.id === action.id && data.criterion?.text === action.text && data.nextAction === action.nextAction;
        } catch { return false; }
      });
      if (!bound) fail(`Criterion ${action.id} needs independently verified action evidence`);
    }
    if (mismatch) return { complete: false, issues: ['Slice inventory does not match manifest'], outstanding };
    if (slices.some(s => s.state !== 'CLOSED' || !merged(s.number, base))) return { complete: false, issues: ['Required slice is incomplete'], outstanding };
    return { ...validateEpicEvidence({ criteria, records, evidence }), criteria, records, outstanding };
  } catch (error) { return { complete: false, issues: [error.message], outstanding: [] }; }
}

function verifyNative({ epic, slices, base, repo }, { read, merged, native }) {
  const packet = native({ repo, issue: epic.number });
  const criteria = parseCriteria(epic.body);
  if (!criteria.length || !unique(criteria.map(c => c.id))) fail('Missing or duplicate criteria');
  if (!packet || packet.version !== 1 || packet.epic !== epic.number || !Array.isArray(packet.children) || !Array.isArray(packet.outcomes)) fail('Invalid epic outcome review');
  const inventory = slices.map(s => s.number);
  if (!inventory.length || !unique(inventory) || !unique(packet.children) || packet.children.length !== inventory.length || packet.children.some(n => !inventory.includes(n))) fail('Epic review child inventory is stale; review every linked child');
  if (packet.outcomes.length !== criteria.length || !unique(packet.outcomes.map(o => o?.criterion?.id))) fail('Epic review must cover every criterion once');
  const outstanding = [];
  for (const c of criteria) {
    const outcome = packet.outcomes.find(o => o?.criterion?.id === c.id);
    if (!outcome || outcome.criterion.text !== c.text || !['met', 'unmet', 'unverifiable'].includes(outcome.state)) fail(`Review criterion ${c.id} against its current text`);
    if (!Array.isArray(outcome.evidence) || !outcome.evidence.length) fail(`Criterion ${c.id} needs evidence`);
    for (const ref of outcome.evidence) {
      let url; try { url = new URL(ref.url); } catch { fail(`Criterion ${c.id} has an invalid evidence URL`); }
      if (!['http:', 'https:'].includes(url.protocol) || !/^[a-f0-9]{64}$/.test(ref.sha256 || '') || createHash('sha256').update(read(ref.url)).digest('hex') !== ref.sha256) fail(`Criterion ${c.id} has missing or stale evidence`);
    }
    if (outcome.state !== 'met') {
      if (!nonempty(outcome.nextAction)) fail(`Criterion ${c.id} needs a concrete next action`);
      outstanding.push({ id: c.id, text: c.text, nextAction: outcome.nextAction });
    } else if (!c.checked) fail(`Check verified criterion ${c.id}`);
  }
  if (outstanding.length) return { complete: false, issues: outstanding.map(c => `Criterion ${c.id} is incomplete: ${c.nextAction}`), outstanding };
  if (slices.some(s => s.state !== 'CLOSED' || !merged(s.number, base))) fail('Required child is open or lacks a merged closing PR');
  return { complete: true, issues: [], outstanding: [], criteria, packet };
}
