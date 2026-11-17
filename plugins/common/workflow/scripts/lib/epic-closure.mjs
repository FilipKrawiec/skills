import { gh } from './core.mjs';
import { resolveNativeEpicEvidence } from './epic-attestation.mjs';

const unique = values => new Set(values).size === values.length;
const nonempty = s => typeof s === 'string' && s.trim().length > 0;
const fail = message => { throw new Error(message); };
// What only a newer Reviewer outcome comment can fix; drive dispatches the Reviewer for these instead of asking the owner.
const stale = message => { throw Object.assign(new Error(message), { needsReview: true }); };

const criterionFormat = '- [ ] <criterion text> <!-- workflow:criterion <id> -->';
const evidenceFormat = 'https://github.com/OWNER/REPO/pull/<number>, or a commit link https://github.com/OWNER/REPO/commit/<sha> whose merged PR is used';
const criteriaSection = /^(#{2,4} Acceptance criteria\s*$)([\s\S]*?)(?=^#{1,4} |(?![\s\S]))/mi;
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
// Gives every criterion without one a stable `workflow:criterion` ID, so no epic needs a hand edit; existing IDs stay.
export function addCriterionIds(body) {
  const section = (body || '').match(criteriaSection);
  if (!section) return body;
  const used = new Set([...section[2].matchAll(/<!-- workflow:criterion ([A-Za-z0-9._-]+) -->/g)].map(m => m[1]));
  let count = 0;
  const lines = section[2].split('\n').map(line => {
    const m = line.match(/^(\s*[-*] \[[ xX]\] )(.+?)\s*$/);
    if (!m || /<!-- workflow:criterion /.test(line)) return line;
    count++;
    let id = slug(m[2]) || `criterion-${count}`; let n = 2;
    while (used.has(id)) id = `${slug(m[2]) || `criterion-${count}`}-${n++}`;
    used.add(id);
    return `${m[1]}${m[2]} <!-- workflow:criterion ${id} -->`;
  });
  return (body || '').replace(criteriaSection, () => `${section[1]}${lines.join('\n')}`);
}
// Ticks the criteria `ids` name; every other line stays as it is.
export const tickCriteria = (body, ids) => (body || '').replace(/^(\s*[-*] )\[ \]( .+?\s*<!-- workflow:criterion ([A-Za-z0-9._-]+) -->.*)$/gm, (line, head, rest, id) => ids.includes(id) ? `${head}[x]${rest}` : line);

function parseCriteria(body) {
  const section = (body || '').match(/^#{2,4} Acceptance criteria\s*$([\s\S]*?)(?=^#{1,4} |(?![\s\S]))/mi)?.[1];
  if (!section) fail('Missing acceptance criteria');
  const lines = section.split('\n').filter(line => /^\s*[-*] \[[ xX]\]/.test(line));
  return lines.map(line => {
    const match = line.match(/^\s*[-*] \[([ xX])\] (.+?)\s*<!-- workflow:criterion ([A-Za-z0-9._-]+) -->/);
    if (!match) fail(`Every criterion needs a stable ID; expected line format: ${criterionFormat}`);
    return { id: match[3], text: match[2], checked: match[1].toLowerCase() === 'x' };
  });
}

// An issue or PR of this repository named by a cited link; other links are the Reviewer's to judge.
function repoRef(link, repo) {
  const url = new URL(link);
  const slug = repo.toLowerCase();
  const path = url.pathname.toLowerCase().replace(/\/+$/, '');
  const commit = url.hostname === 'github.com' && path.match(new RegExp(`^/${slug}/commit/([0-9a-f]{7,40})$`));
  if (commit) return { sha: commit[1], pr: true };
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

// The merged PR a commit link stands for: the one merged into the base that contains the commit.
function commitPr(repo, sha, base) {
  const prs = gh(['api', `repos/${repo}/commits/${sha}/pulls`]);
  const merged = (Array.isArray(prs) ? prs : []).find(pr => pr.merged_at && pr.base?.ref === base);
  return merged ? merged.number : null;
}

// The Reviewer's newest outcome comment must cover every criterion and child; drive checks only what is deterministic.
export function verifyEpicClosure({ epic, slices, base, repo }, adapters = {}) {
  const native = adapters.native || resolveNativeEpicEvidence;
  const lookup = adapters.lookup || lookupRef;
  const commitToPr = adapters.commitPr || commitPr;
  const merged = adapters.merged;
  try {
    const packet = native({ repo, issue: epic.number });
    const criteria = parseCriteria(epic.body);
    if (!criteria.length || !unique(criteria.map(c => c.id))) fail('Missing or duplicate criteria');
    if (!packet || packet.version !== 1 || packet.epic !== epic.number || !Array.isArray(packet.children) || !Array.isArray(packet.outcomes)) fail('Invalid epic outcome review');
    const inventory = slices.map(s => s.number);
    if (!inventory.length || !unique(inventory) || !unique(packet.children) || packet.children.length !== inventory.length || packet.children.some(n => !inventory.includes(n))) stale('Epic review child inventory is stale; the Reviewer must post a newer outcome comment covering every linked child');
    if (packet.outcomes.length !== criteria.length || !unique(packet.outcomes.map(o => o?.criterion?.id))) stale('Epic review must cover every criterion once');
    const outstanding = []; const unchecked = [];
    for (const c of criteria) {
      const outcome = packet.outcomes.find(o => o?.criterion?.id === c.id);
      if (!outcome || outcome.criterion.text !== c.text || !['met', 'unmet', 'unverifiable'].includes(outcome.state)) stale(`Review criterion ${c.id} against its current text`);
      if (!nonempty(outcome.explanation)) fail(`Criterion ${c.id} needs an explanation connecting its evidence to the outcome`);
      if (!Array.isArray(outcome.evidence) || !outcome.evidence.length) fail(`Criterion ${c.id} needs evidence links`);
      for (const link of outcome.evidence) {
        let ref; try { const url = new URL(link); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); ref = repoRef(link, repo); } catch { fail(`Criterion ${c.id} cites an invalid evidence link; expected ${evidenceFormat}`); }
        if (!ref) continue;
        if (ref.sha) {
          const number = commitToPr(repo, ref.sha, base);
          if (!number) fail(`Criterion ${c.id} cites ${link}, whose commit is in no PR merged into ${base}; cite the merged PR as ${evidenceFormat}`);
          ref = { number, pr: true };
        }
        const found = lookup(repo, ref.number);
        if (!found || found.pr !== ref.pr) fail(`Criterion ${c.id} cites ${link}, which does not exist in ${repo}`);
        if (found.pr && (found.merged !== true || found.base !== base)) fail(`Criterion ${c.id} cites ${link}, which is not merged into ${base}`);
      }
      if (outcome.state !== 'met') {
        if (!nonempty(outcome.nextAction)) fail(`Criterion ${c.id} needs a concrete next action`);
        outstanding.push({ id: c.id, text: c.text, nextAction: outcome.nextAction });
      } else if (!c.checked) unchecked.push(c.id);
    }
    if (outstanding.length) return { complete: false, issues: outstanding.map(c => `Criterion ${c.id} is incomplete: ${c.nextAction}`), outstanding };
    if (unchecked.length) return { complete: false, issues: [`Check verified criteria ${unchecked.join(', ')}`], outstanding: [], unchecked };
    if (slices.some(s => s.state !== 'CLOSED' || !merged(s.number, base))) fail('Required child is open or lacks a merged closing PR');
    return { complete: true, issues: [], outstanding: [], criteria, packet };
  } catch (error) { return { complete: false, issues: [error.message], outstanding: [], ...(error.needsReview ? { needsReview: true } : {}) }; }
}
