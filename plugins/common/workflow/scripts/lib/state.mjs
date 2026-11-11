import { prRecord } from './board.mjs';
import { jsonCommand } from './core.mjs';
import { checkState, failedStates, passedStates, prFields } from './pr.mjs';

// One check summary for the head: red wins over pending, pending over green; no checks reads `none`.
export function ciState(checks = []) {
  if (!checks.length) return 'none';
  if (checks.some(check => failedStates.includes(checkState(check)))) return 'red';
  return checks.every(check => passedStates.includes(checkState(check))) ? 'green' : 'pending';
}
const verdictOf = review => /<!-- agent-review\b[^>]*\bverdict=(\w+)/.exec(review?.body || '')?.[1] || null;
// What happens next on an open PR and who does it, first match wins. Only the risk label (and the round cap's
// review:owner) brings in the owner; line count never does.
function nextAction(pr, record, ci, verdict, owner) {
  if (pr.state === 'MERGED') return { action: 'done', actor: 'cli' };
  if (pr.state !== 'OPEN') return { action: 'none', actor: 'owner', reason: `PR is ${pr.state.toLowerCase()}` };
  if (pr.mergeable === 'CONFLICTING') return { action: 'fix', actor: 'implementer', reason: 'conflicts with its base' };
  if (ci === 'red') return { action: 'fix', actor: 'implementer', reason: 'a check failed' };
  if (record.awaitingReview) return ci === 'pending' ? { action: 'wait-ci', actor: 'cli' } : { action: 'review', actor: 'reviewer' };
  if (verdict === 'fixes') return { action: 'fix', actor: 'implementer', reason: 'blocking review findings' };
  if (verdict === 'split') return { action: 'split', actor: 'planner' };
  if (['cap', 'owner'].includes(verdict) || (owner.needed && !record.ownerApproved)) return { action: 'owner-review', actor: 'owner', reason: owner.reason };
  // A draft whose newest verdict at its head is `ready` is handed off (`pr ready`); its approval follows on the ready PR.
  if (record.shipReady) return { action: 'ready', actor: 'cli', reason: 'verdict ready on a draft' };
  if (!record.approved) return { action: 'review', actor: 'reviewer', reason: 'no approval at the head' };
  if (ci === 'pending') return { action: 'wait-ci', actor: 'cli' };
  return { action: 'merge', actor: 'cli' };
}
export function prState(pr, lanes) {
  const labels = (pr.labels || []).map(label => label.name);
  const record = prRecord({ ...pr, labels: pr.labels || [] }, lanes);
  const ci = ciState(pr.statusCheckRollup);
  const reviewer = (pr.reviews || []).filter(review => review.author?.login?.toLowerCase() === lanes.reviewer?.toLowerCase() && verdictOf(review));
  const atHead = reviewer.filter(review => review.commit?.oid === pr.headRefOid && review.state !== 'DISMISSED');
  const verdict = verdictOf(atHead.at(-1));
  const risk = labels.find(label => /^risk:R\d$/.test(label))?.slice(5) || null;
  const owner = labels.includes('review:owner') ? { needed: true, reason: 'review:owner' } : risk === 'R2' ? { needed: true, reason: 'risk R2' } : { needed: false };
  return {
    kind: 'pr', number: pr.number, url: pr.url, state: pr.state, draft: pr.isDraft, head: pr.headRefOid, ci, verdict,
    round: reviewer.filter(review => verdictOf(review) !== 'split').length, labels, mergeable: pr.mergeable, risk,
    issues: record.issues, next: nextAction(pr, record, ci, verdict, owner),
  };
}
function readPr(repo, number) { return jsonCommand('gh', ['pr', 'view', String(number), '--repo', repo, '--json', prFields]); }
function issueState(repo, number, lanes) {
  const issue = jsonCommand('gh', ['issue', 'view', String(number), '--repo', repo, '--json', 'number,url,state,title,labels,milestone']);
  const labels = issue.labels.map(label => label.name);
  const base = { kind: 'issue', number: issue.number, url: issue.url, state: issue.state, labels, milestone: issue.milestone?.title || null };
  if (issue.state !== 'OPEN') return { ...base, next: { action: 'done', actor: 'cli' } };
  const open = jsonCommand('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', prFields]);
  const pr = open.find(candidate => prRecord({ ...candidate, labels: candidate.labels || [] }, lanes).issues.includes(issue.number));
  if (pr) { const state = prState(pr, lanes); return { ...base, pr: state.number, next: state.next }; }
  const blockers = jsonCommand('gh', ['api', `repos/${repo}/issues/${number}/dependencies/blocked_by`]).filter(dep => dep.state === 'open').map(dep => dep.number);
  if (blockers.length) return { ...base, blockedBy: blockers, next: { action: 'wait', actor: 'cli', reason: `blocked by ${blockers.map(n => `#${n}`).join(', ')}` } };
  return { ...base, next: labels.includes('type:epic') ? { action: 'deliver-epic', actor: 'cli' } : { action: 'start', actor: 'implementer' } };
}
const number = value => { if (!/^[1-9]\d*$/.test(value || '')) throw new Error('Expected a PR or issue number'); return Number(value); };
export function statusCommand(args, lanes) {
  if (args.length !== 1) throw new Error('Usage: status NUMBER');
  const n = number(args[0]);
  const isPr = Boolean(jsonCommand('gh', ['api', `repos/${lanes.repo}/issues/${n}`]).pull_request);
  console.log(JSON.stringify(isPr ? prState(readPr(lanes.repo, n), lanes) : issueState(lanes.repo, n, lanes)));
}
const sleep = seconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
// Whether the condition holds (true), failed for good (false) or still pending (null).
function settled(until, state) {
  if (state.state === 'CLOSED' && until !== 'reviewed') return false;
  if (until === 'merged') return state.state === 'MERGED' ? true : null;
  if (until === 'ci') return state.ci === 'red' ? false : ['green', 'none'].includes(state.ci) ? true : null;
  return state.verdict ? true : null;
}
// Blocks in the CLI, not in an agent: a session runs it in the background and is woken once, when it exits.
export function waitCommand(args, lanes, { pause = sleep, now = Date.now, read = readPr } = {}) {
  const usage = 'Usage: wait NUMBER --until ci|reviewed|merged [--timeout MINUTES] [--interval SECONDS]';
  const [value, ...rest] = args;
  const o = {};
  while (rest.length) { const key = rest.shift(); if (!['--until', '--timeout', '--interval'].includes(key) || !rest.length || Object.hasOwn(o, key)) throw new Error(usage); o[key] = rest.shift(); }
  if (!['ci', 'reviewed', 'merged'].includes(o['--until'])) throw new Error(usage);
  const n = number(value);
  const timeout = Number(o['--timeout'] ?? 120), interval = Number(o['--interval'] ?? 30);
  if (!(timeout > 0) || !(interval >= 1)) throw new Error(usage);
  const deadline = now() + timeout * 60_000;
  let last = '';
  for (;;) {
    const state = prState(read(lanes.repo, n), lanes);
    const line = JSON.stringify({ number: n, state: state.state, ci: state.ci, verdict: state.verdict, head: state.head });
    if (line !== last) { console.log(line); last = line; }
    const done = settled(o['--until'], state);
    if (done !== null) return done ? 0 : 1;
    if (now() >= deadline) { console.error(`workflow: timed out after ${timeout} minutes waiting for ${o['--until']} on #${n}`); return 1; }
    pause(interval);
  }
}
// Open PRs with their next action; --owner keeps what only the owner can do, plus draft epics waiting on the owner.
export function nextCommand(args, lanes) {
  if (args.length > 1 || (args.length && args[0] !== '--owner')) throw new Error('Usage: next [--owner]');
  const owner = args[0] === '--owner';
  const prs = jsonCommand('gh', ['pr', 'list', '--repo', lanes.repo, '--state', 'open', '--limit', '200', '--json', prFields]).map(pr => prState(pr, lanes));
  const items = prs.filter(pr => !owner || pr.next.actor === 'owner').map(pr => ({ kind: 'pr', number: pr.number, url: pr.url, ...pr.next }));
  if (owner) {
    const epics = jsonCommand('gh', ['issue', 'list', '--repo', lanes.repo, '--state', 'open', '--label', 'type:epic', '--label', 'lane:owner', '--json', 'number,url']);
    items.push(...epics.map(epic => ({ kind: 'epic', number: epic.number, url: epic.url, action: 'decide', actor: 'owner', reason: 'draft epic waits on the owner' })));
  }
  console.log(JSON.stringify(items));
}
