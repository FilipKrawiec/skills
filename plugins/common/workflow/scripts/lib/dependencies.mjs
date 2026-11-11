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
// What GitHub says about one dependency: an issue or a PR, whether it closed and whether its change merged.
function resolveDependency(repo, number, read) {
  const item = read(['api', `repos/${repo}/issues/${number}`]);
  if (item.pull_request) {
    const state = read(['pr', 'view', String(number), '--repo', repo, '--json', 'state']).state;
    return { number, kind: 'pr', state, merged: state === 'MERGED' };
  }
  const state = item.state.toUpperCase();
  if (state === 'OPEN') return { number, kind: 'issue', state };
  const needsNoCode = (item.labels || []).some(label => (label.name ?? label) === 'type:epic') || pathsFromIssueBody(item.body || '')?.length === 0;
  let merged = false;
  if (item.state_reason === 'completed' && !needsNoCode) {
    const closes = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?) #${number}\\b`, 'i');
    merged = read(['pr', 'list', '--repo', repo, '--state', 'merged', '--limit', '200', '--json', 'number,body,closingIssuesReferences'])
      .some(pr => (pr.closingIssuesReferences || []).some(ref => ref.number === number) || closes.test(pr.body || ''));
  }
  return { number, kind: 'issue', state, reason: item.state_reason, merged, needsNoCode };
}
// The issue's dependencies, resolved, from its blocked-by links and its scope packet.
export function readDependencies(repo, issue, read = defaultRead) {
  const links = read(['api', `repos/${repo}/issues/${issue.number}/dependencies/blocked_by`]).map(dep => dep.number);
  const numbers = [...new Set([...links, ...dependenciesFromIssueBody(issue.body || '')])].filter(n => n !== issue.number).sort((a, b) => a - b);
  return numbers.map(number => resolveDependency(repo, number, read));
}
