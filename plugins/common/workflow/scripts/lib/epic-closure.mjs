import { gh } from './core.mjs';
import { resolveNativeEpicEvidence } from './epic-attestation.mjs';

const unique = values => new Set(values).size === values.length;
const nonempty = s => typeof s === 'string' && s.trim().length > 0;
const fail = message => { throw new Error(message); };
// What only a newer Reviewer outcome comment can fix; drive dispatches the Reviewer for these instead of asking the owner.
const stale = message => { throw Object.assign(new Error(message), { needsReview: true }); };

function parseCriteria(body) {
  const section = (body || '').match(/^#{2,4} Acceptance criteria\s*$([\s\S]*?)(?=^#{1,4} |(?![\s\S]))/mi)?.[1];
  if (!section) fail('Missing acceptance criteria');
  const lines = section.split('\n').filter(line => /^\s*[-*] \[[ xX]\]/.test(line));
  return lines.map(line => {
    const match = line.match(/^\s*[-*] \[([ xX])\] (.+?)\s*<!-- workflow:criterion ([A-Za-z0-9._-]+) -->\s*$/);
    if (!match) fail('Every criterion needs a stable ID');
    return { id: match[3], text: match[2], checked: match[1].toLowerCase() === 'x' };
  });
}

// An issue or PR of this repository named by a cited link; other links are the Reviewer's to judge.
function repoRef(link, repo) {
  const url = new URL(link);
  const slug = repo.toLowerCase();
  const path = url.pathname.toLowerCase().replace(/\/+$/, '');
  const web = url.hostname === 'github.com' && path.match(new RegExp(`^/${slug}/(pull|issues)/([0-9]+)$`));
  const api = url.hostname === 'api.github.com' && path.match(new RegExp(`^/repos/${slug}/(pulls|issues)/([0-9]+)$`));
  const match = web || api;
  return match ? { number: Number(match[2]), pr: match[1].startsWith('pull') } : null;
}

function lookupRef(repo, number) {
  const item = gh(['api', `repos/${repo}/issues/${number}`]);
  if (!item.pull_request) return { number, pr: false };
  const pr = gh(['api', `repos/${repo}/pulls/${number}`]);
  return { number, pr: true, merged: pr.merged === true, base: pr.base?.ref };
}

// The Reviewer's newest outcome comment must cover every criterion and child; drive checks only what is deterministic.
export function verifyEpicClosure({ epic, slices, base, repo }, adapters = {}) {
  const native = adapters.native || resolveNativeEpicEvidence;
  const lookup = adapters.lookup || lookupRef;
  const merged = adapters.merged;
  try {
    const packet = native({ repo, issue: epic.number });
    const criteria = parseCriteria(epic.body);
    if (!criteria.length || !unique(criteria.map(c => c.id))) fail('Missing or duplicate criteria');
    if (!packet || packet.version !== 1 || packet.epic !== epic.number || !Array.isArray(packet.children) || !Array.isArray(packet.outcomes)) fail('Invalid epic outcome review');
    const inventory = slices.map(s => s.number);
    if (!inventory.length || !unique(inventory) || !unique(packet.children) || packet.children.length !== inventory.length || packet.children.some(n => !inventory.includes(n))) stale('Epic review child inventory is stale; the Reviewer must post a newer outcome comment covering every linked child');
    if (packet.outcomes.length !== criteria.length || !unique(packet.outcomes.map(o => o?.criterion?.id))) stale('Epic review must cover every criterion once');
    const outstanding = [];
    for (const c of criteria) {
      const outcome = packet.outcomes.find(o => o?.criterion?.id === c.id);
      if (!outcome || outcome.criterion.text !== c.text || !['met', 'unmet', 'unverifiable'].includes(outcome.state)) stale(`Review criterion ${c.id} against its current text`);
      if (!nonempty(outcome.explanation)) fail(`Criterion ${c.id} needs an explanation connecting its evidence to the outcome`);
      if (!Array.isArray(outcome.evidence) || !outcome.evidence.length) fail(`Criterion ${c.id} needs evidence links`);
      for (const link of outcome.evidence) {
        let ref; try { const url = new URL(link); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); ref = repoRef(link, repo); } catch { fail(`Criterion ${c.id} cites an invalid evidence link`); }
        if (!ref) continue;
        const found = lookup(repo, ref.number);
        if (!found || found.pr !== ref.pr) fail(`Criterion ${c.id} cites ${link}, which does not exist in ${repo}`);
        if (found.pr && (found.merged !== true || found.base !== base)) fail(`Criterion ${c.id} cites ${link}, which is not merged into ${base}`);
      }
      if (outcome.state !== 'met') {
        if (!nonempty(outcome.nextAction)) fail(`Criterion ${c.id} needs a concrete next action`);
        outstanding.push({ id: c.id, text: c.text, nextAction: outcome.nextAction });
      } else if (!c.checked) fail(`Check verified criterion ${c.id}`);
    }
    if (outstanding.length) return { complete: false, issues: outstanding.map(c => `Criterion ${c.id} is incomplete: ${c.nextAction}`), outstanding };
    if (slices.some(s => s.state !== 'CLOSED' || !merged(s.number, base))) fail('Required child is open or lacks a merged closing PR');
    return { complete: true, issues: [], outstanding: [], criteria, packet };
  } catch (error) { return { complete: false, issues: [error.message], outstanding: [], ...(error.needsReview ? { needsReview: true } : {}) }; }
}
