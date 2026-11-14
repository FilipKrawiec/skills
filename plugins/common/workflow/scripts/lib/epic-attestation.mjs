import { config, gh, git, parseRepo } from './core.mjs';

const login = value => typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value);
const criterionValid = value => value && typeof value.id === 'string' && value.id.trim() && typeof value.text === 'string' && value.text.trim();
const refsValid = refs => Array.isArray(refs) && refs.length && new Set(refs.map(ref => ref?.id)).size === refs.length && refs.every(ref => {
  try { return typeof ref.id === 'string' && !!ref.id.trim() && ['http:', 'https:'].includes(new URL(ref.url).protocol) && /^[a-f0-9]{64}$/.test(ref.sha256); } catch { return false; }
});
const sameRefs = (a, b) => refsValid(a) && refsValid(b) && a.length === b.length && a.every(x => b.some(y => x.id === y.id && x.url === y.url && x.sha256 === y.sha256));
const parse = body => { try { return JSON.parse(body); } catch { return null; } };

// Fetch trusted roles and all issue comments anew on every call; injected functions are adapters.
export function resolveEpicVerification({ repo, issue, commentId, criterion, evidence, state }, adapters = {}) {
  parseRepo(repo);
  if (!Number.isSafeInteger(issue) || issue < 1 || !Number.isSafeInteger(commentId) || commentId < 1 || !criterionValid(criterion) || !refsValid(evidence) || !['met', 'unmet', 'unverifiable'].includes(state)) throw new Error('Invalid attestation request');
  const trustedConfig = adapters.trustedConfig || (() => { git('fetch', '--quiet', 'origin'); return config().lanes; });
  const comments = adapters.comments || ((repository, number) => gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${number}/comments?per_page=100`]).flat());
  const editState = adapters.editState || (nodeId => gh(['api', 'graphql', '-f', 'query=query($id:ID!){node(id:$id){... on IssueComment{id lastEditedAt}}}', '-f', `id=${nodeId}`]).data.node);
  const cfg = trustedConfig();
  if (!cfg || cfg.repo?.toLowerCase() !== repo.toLowerCase() || !login(cfg.reviewer) || !login(cfg.implementer) || cfg.reviewer.toLowerCase() === cfg.implementer.toLowerCase()) throw new Error('Missing or non-independent trusted identities');
  const list = comments(repo, issue);
  if (!Array.isArray(list)) throw new Error('Invalid comments response');
  const matching = list.filter(item => parse(item?.body)?.criterion?.id === criterion.id);
  if (matching.length !== 1 || matching[0]?.id !== commentId) throw new Error('Missing or ambiguous verification');
  const item = matching[0], payload = parse(item.body);
  if (typeof item.node_id !== 'string' || !item.node_id) throw new Error('Missing comment node');
  const edit = editState(item.node_id);
  if (!edit || edit.id !== item.node_id || edit.lastEditedAt !== null) throw new Error('Edited or inaccessible verification');
  if (!login(item.user?.login) || item.user.login.toLowerCase() !== cfg.reviewer.toLowerCase() || !item.created_at || item.created_at !== item.updated_at || !Number.isFinite(Date.parse(item.created_at)) || payload.version !== 1 || payload.state !== state || !criterionValid(payload.criterion) || payload.criterion.id !== criterion.id || payload.criterion.text !== criterion.text || !sameRefs(payload.evidence, evidence)) throw new Error('Invalid or stale verification');
  return { reviewer: item.user.login, criterion, evidence, state };
}

// The API-authenticated comment author binds the exact records file bytes.
export function resolveEpicRecordAuthor({ repo, issue, commentId, recordsUrl, sha256 }, adapters = {}) {
  parseRepo(repo);
  if (!Number.isSafeInteger(issue) || issue < 1 || !Number.isSafeInteger(commentId) || commentId < 1 || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid record author request');
  const comments = adapters.comments || ((repository, number) => gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${number}/comments?per_page=100`]).flat());
  const editState = adapters.editState || (nodeId => gh(['api', 'graphql', '-f', 'query=query($id:ID!){node(id:$id){... on IssueComment{id lastEditedAt}}}', '-f', `id=${nodeId}`]).data.node);
  const list = comments(repo, issue);
  if (!Array.isArray(list)) throw new Error('Record author comments unavailable');
  const matches = list.filter(item => item?.id === commentId);
  if (matches.length !== 1) throw new Error('Missing or ambiguous record author comment');
  const item = matches[0], payload = parse(item.body);
  if (!item.node_id || !login(item.user?.login) || !item.created_at || item.created_at !== item.updated_at || !Number.isFinite(Date.parse(item.created_at))) throw new Error('Invalid record author comment');
  const edit = editState(item.node_id);
  if (!edit || edit.id !== item.node_id || edit.lastEditedAt !== null) throw new Error('Edited or inaccessible record author comment');
  if (payload?.version !== 1 || payload.recordsUrl !== recordsUrl || payload.sha256 !== sha256) throw new Error('Record author comment does not bind current records bytes');
  return item.user.login;
}

// One authenticated, unedited Reviewer comment holds the complete current outcome assessment.
export function resolveNativeEpicEvidence({ repo, issue }, adapters = {}) {
  parseRepo(repo);
  const trustedConfig = adapters.trustedConfig || (() => { git('fetch', '--quiet', 'origin'); return config().lanes; });
  const comments = adapters.comments || ((repository, number) => gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${number}/comments?per_page=100`]).flat());
  const editState = adapters.editState || (nodeId => gh(['api', 'graphql', '-f', 'query=query($id:ID!){node(id:$id){... on IssueComment{id lastEditedAt}}}', '-f', `id=${nodeId}`]).data.node);
  const cfg = trustedConfig();
  if (!cfg || cfg.repo?.toLowerCase() !== repo.toLowerCase() || !login(cfg.reviewer) || !login(cfg.implementer) || cfg.reviewer.toLowerCase() === cfg.implementer.toLowerCase()) throw new Error('Missing or non-independent trusted identities');
  const list = comments(repo, issue);
  if (!Array.isArray(list)) throw new Error('Epic review comments unavailable');
  const matches = list.filter(item => parse(item?.body)?.kind === 'workflow:epic-outcomes');
  if (matches.length !== 1) throw new Error('Post exactly one current independent epic outcome review');
  const item = matches[0];
  if (!item.node_id || item.user?.login?.toLowerCase() !== cfg.reviewer.toLowerCase() || !item.created_at || item.created_at !== item.updated_at || !Number.isFinite(Date.parse(item.created_at))) throw new Error('Epic outcome review is not from the configured independent Reviewer');
  const edit = editState(item.node_id);
  if (!edit || edit.id !== item.node_id || edit.lastEditedAt !== null) throw new Error('Epic outcome review was edited or is inaccessible');
  return parse(item.body);
}
