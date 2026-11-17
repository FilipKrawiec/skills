import { config, gh, git, parseRepo } from './core.mjs';

const login = value => typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value);
// Accepts raw JSON or one fenced block, after an optional leading HTML comment marker.
const parse = body => {
  if (typeof body !== 'string') return null;
  const text = body.replace(/^\s*<!--[\s\S]*?-->/, '').trim();
  const fenced = text.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  try { return JSON.parse(fenced ? fenced[1] : text); } catch { return null; }
};

// The newest outcome comment by the configured Reviewer is the current assessment; older ones stay as history.
export function resolveNativeEpicEvidence({ repo, issue }, adapters = {}) {
  parseRepo(repo);
  const trustedConfig = adapters.trustedConfig || (() => { git('fetch', '--quiet', 'origin'); return config().lanes; });
  const comments = adapters.comments || ((repository, number) => gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${number}/comments?per_page=100`]).flat());
  const cfg = trustedConfig();
  if (!cfg || cfg.repo?.toLowerCase() !== repo.toLowerCase() || !login(cfg.reviewer) || !login(cfg.implementer) || cfg.reviewer.toLowerCase() === cfg.implementer.toLowerCase()) throw new Error('Missing or non-independent trusted identities');
  const list = comments(repo, issue);
  if (!Array.isArray(list)) throw new Error('Epic review comments unavailable');
  const mine = list
    .filter(item => item?.user?.login?.toLowerCase() === cfg.reviewer.toLowerCase() && parse(item.body)?.kind === 'workflow:epic-outcomes')
    .map((item, index) => ({ item, index, time: Date.parse(item.created_at) }))
    .filter(entry => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time || a.index - b.index);
  if (!mine.length) throw Object.assign(new Error('The configured Reviewer has not posted an epic outcome comment'), { needsReview: true });
  return parse(mine.at(-1).item.body);
}
