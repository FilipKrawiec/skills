import { dependenciesFromIssueBody, pathsFromIssueBody } from './board.mjs';
import { jsonCommand } from './core.mjs';

// An item's dependencies: its GitHub blocked-by links plus the scope packet's `dependencies`, issues or PRs.
// A dependency is met once its change merged, unmet while it is open and dropped when it closed without one.
export function dependencyStatus(dep) {
  if (String(dep.state).toUpperCase() === 'OPEN') return 'unmet';
  if (dep.kind === 'pr') return dep.merged ? 'met' : 'dropped';
  return dep.reason === 'completed' && (dep.merged || dep.needsNoCode) ? 'met' : 'dropped';
}
// The unmet and the dropped dependency numbers, each ascending.
export function splitDependencies(deps = []) {
  const numbers = status => deps.filter(dep => dependencyStatus(dep) === status).map(dep => dep.number).sort((a, b) => a - b);
  return { blockers: numbers('unmet'), dropped: numbers('dropped') };
}
// The earliest an issue may start: a stated `<!-- workflow:not-before ISO -->` date, or `<!-- workflow:wait-days N -->` days
// after the latest merge among its dependencies, whichever is later. Null when neither names one. Pure, so every call on the same
// GitHub state computes the same time.
export function notBefore(body = '', deps = []) {
  const times = [];
  const stated = /<!-- workflow:not-before (\S+) -->/.exec(body)?.[1];
  if (stated && Number.isFinite(Date.parse(stated))) times.push(Date.parse(stated));
  const days = Number(/<!-- workflow:wait-days (\d+) -->/.exec(body)?.[1]);
  const merges = deps.map(dep => Date.parse(dep.mergedAt)).filter(Number.isFinite);
  if (days > 0 && merges.length) times.push(Math.max(...merges) + days * 86_400_000);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
export const droppedReason = (number, dropped) => `#${number} depends on ${dropped.map(n => `#${n}`).join(', ')}, closed as not planned or without its change merged`;

// The first dependency cycle among the nodes ({ number, blockers }), as numbers that start and end on the same one.
export function findCycle(nodes) {
  const byNumber = new Map(nodes.map(node => [node.number, node]));
  const state = new Map();
  const visit = (number, path) => {
    state.set(number, 'open');
    for (const next of [...(byNumber.get(number).blockers || [])].sort((a, b) => a - b)) {
      if (!byNumber.has(next)) continue;
      if (state.get(next) === 'open') return [...path.slice(path.indexOf(next)), next];
      if (!state.has(next)) { const found = visit(next, [...path, next]); if (found) return found; }
    }
    state.set(number, 'done');
    return null;
  };
  for (const node of [...nodes].sort((a, b) => a.number - b.number)) {
    if (!state.has(node.number)) { const found = visit(node.number, [node.number]); if (found) return found; }
  }
  return null;
}

const defaultRead = args => jsonCommand('gh', args);
// The planner closes a consolidated issue after appending `<!-- workflow:consolidated-into N -->`, N being the canonical issue.
export const consolidatedInto = (body = '') => Number(/<!-- workflow:consolidated-into (\d+) -->/.exec(body)?.[1]) || null;
// What GitHub says about one dependency: an issue or a PR, whether it closed and whether its change merged.
// A closed issue folded into another by the planner stands for its consolidation target.
function resolveDependency(repo, number, read, seen = new Set()) {
  const item = read(['api', `repos/${repo}/issues/${number}`]);
  if (item.pull_request) {
    const view = read(['pr', 'view', String(number), '--repo', repo, '--json', 'state,mergedAt']);
    return { number, kind: 'pr', state: view.state, merged: view.state === 'MERGED', ...(view.mergedAt ? { mergedAt: view.mergedAt } : {}) };
  }
  const state = item.state.toUpperCase();
  if (state === 'OPEN') return { number, kind: 'issue', state };
  const target = consolidatedInto(item.body);
  if (target && target !== number && !seen.has(target)) return resolveDependency(repo, target, read, new Set([...seen, number]));
  const needsNoCode = (item.labels || []).some(label => (label.name ?? label) === 'type:epic') || pathsFromIssueBody(item.body || '')?.length === 0;
  let merged = false;
  let mergedAt;
  if (item.state_reason === 'completed' && !needsNoCode) {
    const [owner, name] = repo.split('/');
    const query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){closedByPullRequestsReferences(first:50,includeClosedPrs:true){nodes{merged}}}}}';
    const found = read(['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${number}`]);
    const nodes = (found.data?.repository?.issue?.closedByPullRequestsReferences?.nodes || []).filter(node => node.merged);
    merged = nodes.length > 0;
    mergedAt = nodes.map(node => node.mergedAt).filter(Boolean).sort().at(-1);
  }
  return { number, kind: 'issue', state, reason: item.state_reason, merged, ...(mergedAt ? { mergedAt } : {}), needsNoCode };
}
// The issue's dependencies, resolved, from its blocked-by links and its scope packet.
export function readDependencies(repo, issue, read = defaultRead) {
  // Every page of links: GitHub returns 30 by default, and an unread blocker would let a blocked issue start. A failed read throws.
  const links = read(['api', '--paginate', '--slurp', `repos/${repo}/issues/${issue.number}/dependencies/blocked_by?per_page=100`]).flat().map(dep => dep.number);
  const numbers = [...new Set([...links, ...dependenciesFromIssueBody(issue.body || '')])].filter(n => n !== issue.number).sort((a, b) => a - b);
  const resolved = numbers.map(number => resolveDependency(repo, number, read)).filter(dep => dep.number !== issue.number);
  return resolved.filter((dep, index) => resolved.findIndex(other => other.number === dep.number) === index);
}
