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
// What happens next on an open PR and who does it, first match wins. The owner is asked only on a PR the Reviewer
// approved at its head (risk R2, a review:owner hold, a release); line count and review rounds never ask them.
function nextAction(pr, record, ci, verdict, owner) {
  if (pr.state === 'MERGED') return { action: 'done', actor: 'cli' };
  if (pr.state !== 'OPEN') return { action: 'none', actor: 'owner', reason: `PR is ${pr.state.toLowerCase()}` };
  if (!record.issues.length) return { action: 'link-issue', actor: 'planner', reason: 'no linked issue: spec files one and the body links it' };
  if (pr.mergeable === 'CONFLICTING') return { action: 'fix', actor: 'implementer', reason: 'conflicts with its base' };
  if (ci === 'red') return { action: 'fix', actor: 'implementer', reason: 'a check failed' };
  if (record.awaitingReview) return ci === 'pending' ? { action: 'wait-ci', actor: 'cli' } : { action: 'review', actor: 'reviewer' };
  if (verdict === 'fixes') return { action: 'fix', actor: 'implementer', reason: 'blocking review findings' };
  if (verdict === 'split') return { action: 'split', actor: 'planner' };
  // A draft whose newest verdict at its head is `ready` is handed off (`pr ready`); its approval follows on the ready PR.
  if (record.shipReady) return { action: 'ready', actor: 'cli', reason: 'verdict ready on a draft' };
  if (!record.approved) return { action: 'review', actor: 'reviewer', reason: 'no approval at the head' };
  if (owner.needed && !record.ownerApproved) return { action: 'owner-review', actor: 'owner', reason: owner.reason };
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
  // In a repo whose merge publishes to production (`github.publishOnMerge`), `release` needs the owner's approval of the head first.
  const owner = labels.includes('review:owner') ? { needed: true, reason: 'review:owner' } : risk === 'R2' ? { needed: true, reason: 'risk R2' }
    : lanes.publishOnMerge ? { needed: true, reason: 'merge publishes to production: invoke release' } : { needed: false };
  // A round is one blocking-or-hand-off verdict; the approval posted in the same round and a split never add one.
  const rounds = reviewer.filter(review => review.state !== 'APPROVED' && verdictOf(review) !== 'split').length;
  return {
    kind: 'pr', number: pr.number, url: pr.url, state: pr.state, draft: pr.isDraft, head: pr.headRefOid, ci, verdict,
    round: rounds, labels, mergeable: pr.mergeable, risk,
    issues: record.issues, next: nextAction(pr, record, ci, verdict, owner),
  };
}
function readPr(repo, number) { return jsonCommand('gh', ['pr', 'view', String(number), '--repo', repo, '--json', `${prFields},mergeCommit`]); }
// The check runs and commit statuses on one commit, in the shape `ciState` reads.
function readChecksAt(repo, sha) {
  const runs = jsonCommand('gh', ['api', `repos/${repo}/commits/${sha}/check-runs?per_page=100`]).check_runs.map(run => ({ name: run.name, conclusion: run.conclusion, status: run.status }));
  const statuses = jsonCommand('gh', ['api', `repos/${repo}/commits/${sha}/status`]).statuses.map(status => ({ context: status.context, state: status.state === 'pending' ? 'PENDING' : status.state }));
  return [...runs, ...statuses];
}
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
// Whether the condition holds (true), failed for good (false) or still pending (null). No checks right after a push
// means GitHub has not registered them yet, so `none` settles only in a repo without required checks. `base` is the
// base branch's checks at the merge commit, once the PR has merged.
function settled(until, state, lanes) {
  if (state.state === 'CLOSED' && until !== 'reviewed') return false;
  if (until === 'merged') return state.state === 'MERGED' ? true : null;
  const ci = until === 'base' ? state.base : state.ci;
  if (until === 'ci' || until === 'base') return ci === 'red' ? false : ci === 'green' || (ci === 'none' && !lanes.requiredChecks?.length) ? true : null;
  return state.verdict ? true : null;
}
// Blocks in the CLI, not in an agent: a session runs it in the background and is woken once, when it exits.
export function waitCommand(args, lanes, { pause = sleep, now = Date.now, read = readPr, checksAt = readChecksAt } = {}) {
  const usage = 'Usage: wait NUMBER --until ci|reviewed|merged|base [--timeout MINUTES] [--interval SECONDS]';
  const [value, ...rest] = args;
  const o = {};
  while (rest.length) { const key = rest.shift(); if (!['--until', '--timeout', '--interval'].includes(key) || !rest.length || Object.hasOwn(o, key)) throw new Error(usage); o[key] = rest.shift(); }
  if (!['ci', 'reviewed', 'merged', 'base'].includes(o['--until'])) throw new Error(usage);
  const n = number(value);
  const timeout = Number(o['--timeout'] ?? 120), interval = Number(o['--interval'] ?? 30);
  if (!(timeout > 0) || !(interval >= 1)) throw new Error(usage);
  const deadline = now() + timeout * 60_000;
  let last = '';
  for (;;) {
    const pr = read(lanes.repo, n);
    const state = prState(pr, lanes);
    const merge = o['--until'] === 'base' && state.state === 'MERGED' ? pr.mergeCommit?.oid : null;
    if (merge) state.base = ciState(checksAt(lanes.repo, merge));
    const line = JSON.stringify({ number: n, state: state.state, ci: state.ci, verdict: state.verdict, head: state.head, ...(merge ? { merge, base: state.base } : {}) });
    if (line !== last) { console.log(line); last = line; }
    const done = settled(o['--until'], state, lanes);
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
