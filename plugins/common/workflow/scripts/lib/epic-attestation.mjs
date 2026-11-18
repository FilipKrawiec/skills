import { config, gh, git, parseRepo } from './core.mjs';

const login = value => typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value);
// Accepts raw JSON, the first fence tagged json, else the first untagged fence, after an optional leading HTML comment marker; prose around the fence is ignored.
const parse = body => {
  if (typeof body !== 'string') return null;
  const text = body.replace(/^\s*<!--[\s\S]*?-->/, '').trim();
  const fenced = text.match(/```json[ \t]*\r?\n([\s\S]*?)\r?\n```/i) || text.match(/```[ \t]*\r?\n([\s\S]*?)\r?\n```/);
  try { return JSON.parse(fenced ? fenced[1] : text); } catch { return null; }
};

const FORMAT_HINT = 'The newest Reviewer comment mentioning workflow:epic-outcomes cannot be parsed. Repost it as the marker line <!-- workflow:epic-outcomes --> followed by one fenced ```json block holding the outcome JSON (kind, version, epic, children, outcomes).';

// The newest outcome comment by the configured Reviewer is the current assessment; older ones stay as history.
export function resolveNativeEpicEvidence({ repo, issue }, adapters = {}) {
  parseRepo(repo);
  const trustedConfig = adapters.trustedConfig || (() => { git('fetch', '--quiet', 'origin'); return config().lanes; });
  const comments = adapters.comments || ((repository, number) => gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${number}/comments?per_page=100`]).flat());
  const cfg = trustedConfig();
  if (!cfg || cfg.repo?.toLowerCase() !== repo.toLowerCase() || !login(cfg.reviewer) || !login(cfg.implementer) || cfg.reviewer.toLowerCase() === cfg.implementer.toLowerCase()) throw new Error('Missing or non-independent trusted identities');
  const list = comments(repo, issue);
  if (!Array.isArray(list)) throw new Error('Epic review comments unavailable');
  const byReviewer = list.filter(item => item?.user?.login?.toLowerCase() === cfg.reviewer.toLowerCase());
  const mine = byReviewer
    .filter(item => parse(item.body)?.kind === 'workflow:epic-outcomes')
    .map((item, index) => ({ item, index, time: Date.parse(item.created_at) }))
    .filter(entry => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time || a.index - b.index);
  const broken = byReviewer.filter(item => typeof item.body === 'string' && item.body.includes('workflow:epic-outcomes') && parse(item.body)?.kind !== 'workflow:epic-outcomes')
    .map(item => Date.parse(item.created_at)).filter(Number.isFinite);
  if (broken.length && (!mine.length || Math.max(...broken) > mine.at(-1).time)) throw Object.assign(new Error(FORMAT_HINT), { needsReview: true });
  if (!mine.length) throw Object.assign(new Error('The configured Reviewer has not posted an epic outcome comment'), { needsReview: true });
  return parse(mine.at(-1).item.body);
}
