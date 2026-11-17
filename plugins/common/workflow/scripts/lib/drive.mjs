import { localClaimIsDead, releaseSessionClaim, sessionClaim } from './review-ref.mjs';
import { verifyConsolidatedDelivery } from './consolidated-delivery.mjs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveBranchPolicy } from '../safety.mjs';
import { lockTimeoutStatus, runWithLocks } from '../locks.mjs';
import { boardStatus, dependenciesFromIssueBody, pathsFromIssueBody, pathsWithinScope, prRecord } from './board.mjs';
import { cachedGithubMetadata, cleanEnvironment, ensureWorkflowLabels, git, jsonCommand, run, workflowScratch } from './core.mjs';
import { consolidatedInto, droppedReason, findCycle, readDependencies, splitDependencies } from './dependencies.mjs';
import { checkState, failedStates, prFields } from './pr.mjs';
import { addCriterionIds, tickCriteria, verifyEpicClosure } from './epic-closure.mjs';
import { prState } from './state.mjs';
import { exportedSymbols, reviewPacket } from './packet.mjs';
import { parseUsageLine, recordUsage, usageEntry } from './usage.mjs';
import { pluginRoot, pluginVersion, versionNotice } from './plugin.mjs';
import { approveReady, previousReviewedHead } from './vcs.mjs';
import { busyPaths, parseWorktreeList, removeWorktree, worktreeFacts } from './worktrees.mjs';

const cli = fileURLToPath(new URL('../workflow.mjs', import.meta.url));
const riskGuide = fileURLToPath(new URL('../../skills/review/references/risk.md', import.meta.url));
const risks = ['R0', 'R1', 'R2'];
export const maxRisk = (...values) => risks[Math.max(...values.filter(Boolean).map(value => risks.indexOf(value)), 0)];
// One role x risk x round table names the model and effort of every session drive starts. The Reviewer runs Opus at every
// risk at medium effort (2026-11-16 dry run: Flash approved two defective PRs; 2026-11-17 bench, owner kept Opus medium); the implementer runs Opus only at R2; the risk assessor runs
// Sonnet; the planner and improver run Opus. Effort follows risk (R0 implementer low; R2
// implementer high; every other cell medium) and never exceeds high: no cell and no escalation yields xhigh or max.
const efforts = ['low', 'medium', 'high'];
// From the third blocking verdict on, narrow fixes have stopped converging: one fresh implementer on the strongest model
// takes the whole open set. A blocking verdict after that fresh round cuts scope through the planner (`spec`), who narrows
// the issue to what the PR delivers, never a further fix round. The rounds never hand an unapproved PR to the owner.
export const freshFixRound = 3;
// `round` is the number of blocking verdicts so far. A failing fix round (the second) raises the implementer's effort one
// step before the model changes; the fresh round moves up one model at medium effort.
export function sessionFor(agent, risk, { round = 0, fresh = false } = {}) {
  if (agent === 'devops') return { model: 'sonnet', effort: 'medium' };
  // A mechanical base conflict needs no deeper model; a failed gate hands the merge to the implementer.
  if (agent === 'conflict-resolver') return { model: 'haiku', effort: 'low' };
  if (agent === 'reviewer') return { model: 'opus', effort: 'medium' };
  if (agent === 'implementer') {
    if (fresh) return { model: 'opus', effort: 'medium' };
    const base = efforts.indexOf(risk === 'R2' ? 'high' : risk === 'R0' ? 'low' : 'medium');
    return { model: risk === 'R2' ? 'opus' : 'sonnet', effort: efforts[Math.min(base + (round >= 2 ? 1 : 0), efforts.length - 1)] };
  }
  return { model: 'opus', effort: 'medium' };
}
// The owner's session only routes drive's JSON, so it starts on Sonnet at low effort; the owner starts it with this command.
export const driveSession = { model: 'sonnet', effort: 'low' };
export const driveSessionCommand = target => `claude --model ${driveSession.model} --effort ${driveSession.effort} "/deliver drive ${target}"`;
export const modelFor = risk => sessionFor('implementer', risk).model;
export const modelForStep = (step, risk, round = 0) => sessionFor(step.agent, risk, { round, fresh: Boolean(step.fresh) }).model;
// AGY is advisory only: in the 2026-11-16 dry run its Flash reviewer approved two defective PRs. It may second-guess a risk,
// improve the process or take a custom responsibility, never deliver or judge a PR.
const advisoryAgy = 'AGY is advisory only; it may take the devops risk second opinion, the improver or a custom responsibility';
const deliveryRoles = ['reviewer', 'implementer', 'freshImplementer'];
function validateDelivery(delivery) {
  if (delivery == null) return;
  for (const role of deliveryRoles) {
    const configured = delivery.roles?.[role];
    if ((Array.isArray(configured) ? configured : [configured]).some(choice => choice?.host === 'agy')) throw new Error(`delivery.roles.${role} cannot use host "agy": ${advisoryAgy}`);
  }
}
// Missing configuration retains the existing Claude delivery behavior for migration.
export function deliveryAssignment(delivery, step, risk, round = 0) {
  const { effort } = sessionFor(step.agent, risk, { round, fresh: Boolean(step.fresh) });
  if (delivery == null) return { host: 'claude', model: modelForStep(step, risk, round), effort, session: step.agent === 'reviewer' ? 'separate' : 'subagent' };
  if (!delivery || typeof delivery !== 'object' || !['codex', 'claude'].includes(delivery.orchestrator)) throw new Error('Unsupported delivery orchestrator; configure codex or claude after verifying host capabilities');
  if (delivery.executables != null && (typeof delivery.executables !== 'object' || Array.isArray(delivery.executables) || Object.entries(delivery.executables).some(([host, path]) => !['codex', 'claude', 'agy'].includes(host) || typeof path !== 'string' || !path.trim()))) throw new Error('Configure delivery.executables as host-to-executable paths');
  validateDelivery(delivery);
  if (step.agent === 'conflict-resolver' && !delivery.roles?.['conflict-resolver']) return { host: delivery.orchestrator, model: 'haiku', effort, session: 'subagent' };
  const roleName = step.agent === 'implementer' && step.fresh ? 'freshImplementer' : step.agent;
  const configured = delivery.roles?.[roleName];
  const choices = Array.isArray(configured) ? configured : [configured];
  if (!choices.length || choices.some(role => !role || !['codex', 'claude', 'agy'].includes(role.host) || typeof role.model !== 'string' || !role.model.trim())) throw new Error(`Configure delivery.roles.${roleName} with a supported host and model`);
  const role = choices[0];
  if (role.host === 'agy') {
    if (step.agent !== 'devops') throw new Error(`AGY ${step.agent} dispatch is unverified; reorder delivery.roles.${roleName} to a supported host and rerun drive with the existing work state`);
    return { host: role.host, model: role.model, effort, session: 'native' };
  }
  if (step.agent !== 'reviewer' && role.host !== delivery.orchestrator) throw new Error(`Unsupported cross-host subagent for ${step.agent}; resume drive in the ${role.host} orchestrator or reorder delivery.roles.${roleName} to the current orchestrator, preserving the work state`);
  return { host: role.host, model: role.model, effort, session: step.agent === 'reviewer' ? 'separate' : 'subagent' };
}
const riskLabel = labels => labels.map(label => label.name ?? label).find(name => /^risk:R\d$/.test(name))?.slice(5) || null;
// An epic's final refinement slice: drive finds it by the marker and creates it with the criteria `plan` gives the planner.
const refinementMarker = '<!-- workflow:epic-refinement -->';
const refinementReview = 'Review the merged whole epic against its Outcome, Decisions and architecture rules';
const refinementCriteria = [
  `${refinementReview}. Fix findings in the refinement PR or name them there with reasons. Resolve recorded Nits, aliases, shims and naming clashes, or raise them on owner paths.`,
  'Remove dead files, exports, symbols, fixtures and baseline entries left by the epic. Use project configuration for unused-code tooling; baselines shrink, with no new entries. Make no new feature or behavior change; keep the gate green.',
  'Use project configuration to record before and after times per project gate and CI part; make only measured wins. If a timing source is unavailable or unconfigured, record missing evidence and claim no measured win.',
  'Assess the epic\'s delivery flow: blocked and owner steps, rework, review rounds and cost. File at most two improvements, each with its evidence.',
];

// A risk assessment is a PR comment for each assessed diff, or a legacy issue comment: a marker with
// the risk set, the assessor's risk, the owner floor, the head and the files it saw, then the reason for people to read.
const assessmentMarker = /<!-- workflow:risk (\{.*?\}) -->/;
export function assessmentComment(record) {
  const { risk, assessed, floor, head, paths, reason } = record;
  const meta = JSON.stringify({ risk, assessed, floor: floor || null, head: head || null, paths: paths || [], reason: reason || '' });
  const raised = floor && assessed !== risk ? ` The assessor said ${assessed}; the issue's owner-set \`risk:${floor}\` is the floor.` : '';
  return `<!-- workflow:risk ${meta.replace(/-->/g, '--\\u003e')} -->\n**Risk ${risk}**${head ? ` at ${head.slice(0, 7)}` : ''}: ${reason || 'no reason given'}.${raised}\n`;
}
// The newest assessment among the comments, counting only those `author` (drive's identity) wrote; null when none.
export function latestAssessment(comments, author) {
  const own = comment => !author || (comment.user?.login ?? comment.author?.login)?.toLowerCase() === author.toLowerCase();
  for (const comment of [...comments].reverse()) {
    const match = own(comment) && assessmentMarker.exec(comment.body || '');
    if (!match) continue;
    try {
      const record = JSON.parse(match[1]);
      if (risks.includes(record.risk)) return record;
    } catch { /* not a record drive wrote */ }
  }
  return null;
}
// Assess the draft diff, and reassess a changed head only when it touches files the last assessment did not see.
// A `risk:` hand-back answers a due assessment.
function assessmentStep(facts) {
  const { handBack: hb = {} } = facts;
  const pr = facts.pr?.state === 'OPEN' ? facts.pr : null;
  const last = pr ? facts.prAssessment : facts.issueAssessment;
  let reason = null;
  if (!last) reason = pr ? 'assess the diff of the draft' : 'assess the issue before the build';
  else if (pr) {
    const seen = new Set(last.paths || []);
    const unseen = (facts.diffPaths || []).filter(path => !seen.has(path));
    if (unseen.length) reason = `the head touches ${unseen.length} ${unseen.length === 1 ? 'file' : 'files'} the last assessment did not see: ${unseen.slice(0, 5).join(', ')}${unseen.length > 5 ? ', …' : ''}`;
  }
  if (!reason) return null;
  if (risks.includes(hb.risk)) return { do: 'assess', risk: hb.risk, reason: hb.reason || '' };
  return agent('devops', 'risk', { task: 'risk', reason });
}

// A hand-back is at most 6 `key: value` lines; a bare first word is the status.
export function parseHandBack(text) {
  const all = String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
  // The optional `usage:` line rides along without taking one of the six lines.
  const usage = all.find((line, index) => index > 0 && /^usage:/i.test(line));
  const lines = all.filter(line => line !== usage).slice(0, 6);
  const result = {};
  lines.forEach((line, index) => {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (match) result[match[1].toLowerCase()] = match[2];
    else if (index === 0) result.status = line.split(/\s+/)[0];
  });
  if (usage) result.usage = usage.replace(/^usage:\s*/i, '');
  if (result.status) result.status = result.status.toLowerCase();
  if (result.paths) result.paths = result.paths.split(/[\s,]+/).filter(Boolean);
  return result;
}


const agent = (agentName, mode, extra = {}) => ({ agent: agentName, mode, ...extra });

// ---- Overlap: before drive starts an issue, the planner consolidates unstarted issues that share its outcome.

// The planner appends this to the issue it was briefed on for each other issue it judged a distinct outcome, so drive asks once.
export const distinctMarker = n => `<!-- workflow:distinct ${n} -->`;
const trimPath = path => path.replace(/^\.\//, '').replace(/\/+$/, '');
const pathsOverlap = (a, b) => a.some(p => b.some(q => { const x = trimPath(p); const y = trimPath(q); return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`); }));
const labelNames = issue => (issue.labels || []).map(label => label.name ?? label);
// The unstarted issues `issue` overlaps: same epic (or both standalone), overlapping `scope` paths. Never an epic, a started
// issue, one under `lane:owner`, one with an open PR, one the planner marked distinct, or one tied to it by a dependency.
// `facts` reads lazily, only for the issues whose paths overlap: parentOf(n), hasPr(n), blockedBy(n).
export function findOverlaps(issue, others, facts) {
  const excluded = names => names.some(name => ['type:epic', 'lane:owner', 'state:started'].includes(name));
  const mine = pathsFromIssueBody(issue.body || '');
  if (!mine?.length || excluded(labelNames(issue))) return [];
  const parent = facts.parentOf(issue.number);
  return others.filter(other => {
    if (other.number === issue.number || excluded(labelNames(other))) return false;
    if ((issue.body || '').includes(distinctMarker(other.number)) || (other.body || '').includes(distinctMarker(issue.number))) return false;
    const theirs = pathsFromIssueBody(other.body || '');
    if (!theirs?.length || !pathsOverlap(mine, theirs)) return false;
    if (dependenciesFromIssueBody(issue.body || '').includes(other.number) || dependenciesFromIssueBody(other.body || '').includes(issue.number)) return false;
    if (facts.parentOf(other.number) !== parent || facts.hasPr(other.number)) return false;
    return !facts.blockedBy(issue.number).includes(other.number) && !facts.blockedBy(other.number).includes(issue.number);
  }).map(other => other.number).sort((a, b) => a - b);
}
const consolidatedNumbers = text => (String(text || '').match(/\d+/g) || []).map(Number);
// What a `consolidated` hand-back says the planner merged: the canonical issue and the issues it closed.
export const consolidationReport = hb => ({ into: consolidatedNumbers(hb.into)[0] ?? null, closed: consolidatedNumbers(hb.closed), ...(hb.note ? { note: hb.note } : {}) });
// The branch's changed paths no `scope.paths` entry covers; none for an issue without a packet.
function outOfScopePaths(issue, tree) {
  const scope = pathsFromIssueBody(issue?.body || '');
  return scope === null ? [] : (tree?.diffPaths || []).filter(path => !pathsWithinScope([path], scope));
}
const scopeStep = (mode, paths) => agent('implementer', mode, { reason: `the branch touches ${paths.length === 1 ? 'a path' : 'paths'} outside the issue's scope: ${paths.slice(0, 10).join(', ')}${paths.length > 10 ? `, and ${paths.length - 10} more` : ''}`, outOfScope: paths, resume: true });
const stateLabels = issue => (issue.labels || []).map(label => label.name ?? label).filter(name => name.startsWith('state:'));
const isEpic = issue => (issue.labels || []).some(label => (label.name ?? label) === 'type:epic');

// One issue's next step from what was read about it, first match wins: a mechanical `do` for drive to perform, or a
// terminal `agent`, `wait`, `owner`, `blocked` or `done`. Pure, so re-running on unchanged state repeats it.
export function decideIssue(facts, lanes) {
  const { issue, pr, tree, handBack: hb = {}, blockers = [], dropped = [] } = facts;
  // A closed issue carries no execution label: drive drops a claim it left, whoever closed the issue.
  if (issue.state !== 'OPEN' && stateLabels(issue).length) return { do: 'unclaim' };
  if (issue.state !== 'OPEN') return tree && pr?.state !== 'OPEN' ? { do: 'remove-worktree' } : { done: { issue: issue.number } };
  if (pr?.state === 'MERGED') return { do: 'close' };
  // Unmet dependencies stop the item in every phase and touch nothing; a dropped one needs the owner.
  if (dropped.length) return { owner: droppedReason(issue.number, dropped), url: issue.url };
  if (blockers.length) return { blocked: { issue: issue.number, by: blockers } };
  if (hb.status === 'replan' && (!pr || pr.state !== 'OPEN')) return agent('planner', 'replan', { reason: hb.note || 'the implementer asked to replan' });
  const blockedOwner = { owner: `#${issue.number}: ${hb.note || 'the implementer is blocked'}` };
  if (hb.status === 'blocked' && pr?.state !== 'OPEN') return blockedOwner;
  // A planner split makes the issue an epic, which `drive` routes to `driveEpic`; still a story, the split did not happen,
  // and dispatching the planner again would loop on the same blocking verdict. A narrowed issue is handled with its PR.
  if (hb.status === 'sliced') return { blocked: { issue: issue.number, reason: 'the planner handed back sliced, yet the issue is not an epic' } };
  const claimed = (issue.labels || []).some(label => (label.name ?? label) === 'state:started');
  if (!pr || pr.state !== 'OPEN') {
    if (!claimed || !tree) return { do: 'start' };
    if (hb.status !== 'done') return agent('implementer', 'build');
    if (tree.dirty) return hb.commit && hb.paths?.length ? { do: 'commit' } : agent('implementer', 'build', { reason: 'uncommitted changes and no commit/paths in the hand-back' });
    if (!tree.commits) return agent('implementer', 'build', { reason: 'no commits ahead of the base' });
    const stray = outOfScopePaths(issue, tree);
    if (stray.length) return scopeStep('build', stray);
    return tree.unpushed ? { do: 'push' } : { do: 'open' };
  }
  const state = prState(pr, lanes);
  const completedClaim = facts.reviewingSince && (pr.reviews || []).some(review => review.author?.login?.toLowerCase() === lanes.reviewer?.toLowerCase() && review.commit?.oid === pr.headRefOid && review.state !== 'DISMISSED' && review.body?.includes(`sha=${pr.headRefOid}`) && /<!-- agent-review\b[^>]*\bverdict=(ready|fixes|split|owner)\b/.test(review.body) && Date.parse(review.submittedAt || '') > Math.max(facts.reviewingSince, facts.reviewSession?.startedAt || 0));
  if (facts.reviewSession?.unavailable) return { wait: { pr: pr.number, until: 'reviewed' } };
  if (facts.reviewSession?.oid) {
    if (facts.reviewSession.dead || completedClaim) return { do: 'release-review', claim: facts.reviewSession.oid };
    return { wait: { pr: pr.number, until: 'reviewed' } };
  }
  if (state.labels.includes('state:reviewing') && (completedClaim || facts.postFailed)) return { do: 'release-review' };
  if (state.labels.includes('state:reviewing')) return { wait: { pr: pr.number, until: 'reviewed' } };
  if (facts.postFailed) return agent('reviewer', 'review', { reason: 'the previous review post failed', sameHead: true, round: state.round + 1 });
  const latestVerdict = (pr.reviews || []).filter(review => review.author?.login?.toLowerCase() === lanes.reviewer?.toLowerCase() && review.commit?.oid === pr.headRefOid && review.state !== 'DISMISSED' && /<!-- agent-review\b[^>]*\bverdict=/.test(review.body || '')).at(-1);
  const verdictBody = latestVerdict?.body || '';
  const findings = [...verdictBody.matchAll(/\*\*(?:Blocker|Important)\*\*([\s\S]*?)(?=\*\*(?:Blocker|Important|Nit|Pre-existing|Follow-up)\*\*|$)/g)].map(match => match[1]);
  const threads = facts.reviewThreads;
  let completeThreads = threads === undefined || (Array.isArray(threads?.nodes) && threads.pageInfo?.hasNextPage === false);
  const inline = [];
  for (const thread of Array.isArray(threads?.nodes) ? threads.nodes : []) {
    if (!thread || typeof thread !== 'object') { completeThreads = false; continue; }
    if (thread.isResolved === true) continue;
    const first = thread.comments?.nodes?.[0];
    if (thread.isResolved !== false || !first?.author?.login || typeof first.body !== 'string') { completeThreads = false; continue; }
    if (first.author.login.toLowerCase() !== lanes.reviewer?.toLowerCase()) continue;
    if (/^\*\*(?:Blocker|Important)\*\*/.test(first.body)) inline.push(first.body);
    else if (!/^\*\*(?:Nit|Pre-existing|Follow-up)\*\*/.test(first.body)) completeThreads = false;
  }
  const blocking = [...findings, ...inline];
  // A finding is a base conflict by its opening line, not by mentioning the words anywhere; one that cites a file and line is about code.
  const isConflictFinding = finding => { const first = finding.trim().split('\n')[0]; return /\bconflict/i.test(first) && /\bbase\b/i.test(first) && !/\S+\.\w+:\d+/.test(first); };
  const taggedConflicts = blocking.every(isConflictFinding);
  const conflictOnly = completeThreads && taggedConflicts && (blocking.length > 0 || /<!-- agent-review\b[^>]*\bfinding=base-conflict\b/.test(verdictBody));
  // GitHub reports no conflict, so the verdict is stale (the base moved, or the Reviewer misjudged): the Reviewer judges the head again, once per head.
  const staleConflictVerdicts = (pr.reviews || []).filter(review => review.author?.login?.toLowerCase() === lanes.reviewer?.toLowerCase() && review.commit?.oid === pr.headRefOid && review.state !== 'DISMISSED' && /<!-- agent-review\b[^>]*\bverdict=fixes\b/.test(review.body || '') && (/<!-- agent-review\b[^>]*\bfinding=base-conflict\b/.test(review.body) || [...review.body.matchAll(/\*\*(?:Blocker|Important)\*\*([\s\S]*?)(?=\*\*(?:Blocker|Important|Nit|Pre-existing|Follow-up)\*\*|$)/g)].some(match => isConflictFinding(match[1])))).length;
  const staleReview = agent('reviewer', 'review', { reason: 'the base conflict is stale: GitHub reports the PR mergeable', sameHead: true, round: state.round + 1 });
  const staleConflict = conflictOnly && pr.mergeable === 'MERGEABLE' && staleConflictVerdicts < 2;
  if (hb.status === 'blocked') return staleConflict ? staleReview : blockedOwner;
  if (hb.status === 'replan' && !conflictOnly && pr.mergeable !== 'CONFLICTING' && pr.mergeStateStatus !== 'DIRTY') return agent('planner', 'replan', { reason: hb.note || 'the implementer asked to replan' });
  if (tree && (tree.dirty || tree.unpushed)) {
    if (hb.status !== 'done') return agent('implementer', 'fix', { reason: 'fix in progress' });
    if (tree.dirty) return hb.commit && hb.paths?.length ? { do: 'commit' } : agent('implementer', 'fix', { reason: 'uncommitted changes and no commit/paths in the hand-back' });
    const stray = outOfScopePaths(issue, tree);
    return stray.length ? scopeStep('fix', stray) : { do: 'push' };
  }
  // A finished fix is held for scope before the Reviewer sees it, even when it added no commit.
  if (tree && hb.status === 'done') {
    const stray = outOfScopePaths(issue, tree);
    if (stray.length) return scopeStep('fix', stray);
  }
  const assess = assessmentStep(facts);
  if (assess) return assess;
  // The owner's issue label is a floor; drive raises a PR label to it and never lowers one someone raised.
  const risk = maxRisk(state.risk, riskLabel(issue.labels || []), facts.prAssessment?.risk);
  if (risks.indexOf(risk) > risks.indexOf(state.risk)) return { do: 'risk', risk };
  const next = state.next;
  if (next.action === 'fix' && staleConflict) return staleReview;
  // A narrowed issue changes what the head is judged against: the Reviewer judges the same head again, no new build.
  if (hb.status === 'narrowed' && state.verdict === 'fixes' && !conflictOnly && next.reason !== 'conflicts with its base') return agent('reviewer', 'review', { reason: 'the planner narrowed the issue to what the PR delivers', narrowed: true, round: state.round + 1 });
  if (next.action === 'fix' && conflictOnly && hb.status !== 'done') return agent('implementer', 'fix', { reason: 'base conflict is the only open Blocker or Important finding', resume: true });
  // A disputed finding is the implementer's evidence, not a skipped fix: the Reviewer judges the same head again.
  if (next.action === 'fix' && next.reason === 'blocking review findings' && hb.status === 'disputed') return agent('reviewer', 'review', { reason: 'the implementer disputed the blocking findings; the Reviewer weighs its evidence', sameHead: true, round: state.round + 1 });
  // A fix-mode hand-back at the head the Reviewer judged fixed nothing: the fix reruns with the blocking findings quoted.
  const quoted = blocking.map(finding => finding.trim().replace(/\s+/g, ' ').slice(0, 600)).filter(Boolean).slice(0, 10);
  if (next.action === 'fix' && next.reason === 'blocking review findings' && hb.status === 'done') return agent('implementer', 'fix', { reason: 'the hand-back left the head the Reviewer judged unchanged; fix the findings quoted below', resume: true, findings: quoted });
  if (next.action === 'fix') {
    if (!tree) return { do: 'start' };
    if (next.reason === 'conflicts with its base') return agent('implementer', 'fix', { reason: next.reason, resume: true });
    if (state.verdict === 'fixes' && state.round > freshFixRound) return agent('planner', 'replan', { reason: `round ${state.round}: the fresh fix round left blocking findings; narrow the issue to what the PR delivers` });
    const fresh = state.verdict === 'fixes' && state.round === freshFixRound;
    return agent('implementer', 'fix', fresh ? { reason: `round ${state.round}: the whole open set, fresh`, fresh: true, ...(quoted.length ? { findings: quoted } : {}) } : { reason: next.reason, resume: true, ...(quoted.length ? { findings: quoted } : {}) });
  }
  if (next.action === 'wait-ci') return { wait: { pr: pr.number, until: 'ci' } };
  // An unapproved `ready` verdict on a ready PR asks only for the approval; anything else is a review round.
  if (next.action === 'review') {
    const approve = !pr.isDraft && state.verdict === 'ready';
    // A `ready` verdict at a green head needs no second session: drive posts the approval as the Reviewer. A hold the owner joins
    // (`review:owner`, or an earlier `Owner decision`) is the Reviewer's to judge, so it still launches.
    const ownerHeld = state.labels.includes('review:owner') || (pr.reviews || []).some(review => review.author?.login?.toLowerCase() === lanes.reviewer?.toLowerCase() && /Owner decision/.test(review.body || ''));
    if (approve && state.ci === 'green' && !ownerHeld) return { do: 'approve', round: state.round };
    return agent('reviewer', approve ? 'approve' : 'review', { reason: approve ? 'no approval at the head' : next.reason || 'no verdict at the head', round: approve ? state.round : state.round + 1 });
  }
  // The PR was found through this issue, so drive links it in the body; never an owner step.
  if (next.action === 'link-issue') return { do: 'link-issue' };
  if (next.action === 'split' ) return agent('planner', 'split', { reason: 'the Reviewer asked to split the change' });
  if (next.action === 'ready') return { do: 'ready' };
  // `gh pr update-branch` merges the base in as the implementer; the new head then needs CI and a fresh approval.
  if (next.action === 'update-branch') return { do: 'update-branch' };
  if (next.action === 'merge') return pr.autoMergeRequest ? { wait: { pr: pr.number, until: 'merged' } } : { do: 'auto-merge' };
  if (next.action === 'done') return { do: 'close' };
  return { owner: next.reason || `PR #${pr.number} needs the owner`, url: pr.url };
}

// Open slices in dependency order (blockers inside the epic first, then by number).
export function dependencyOrder(slices) {
  const open = slices.filter(slice => slice.state === 'OPEN').sort((a, b) => a.number - b.number);
  const ordered = []; const placed = new Set();
  while (ordered.length < open.length) {
    const next = open.find(slice => !placed.has(slice.number) && slice.blockers.every(n => placed.has(n) || !open.some(other => other.number === n)));
    if (!next) { ordered.push(...open.filter(slice => !placed.has(slice.number))); break; }
    ordered.push(next); placed.add(next.number);
  }
  return ordered;
}
// Unticked epic criteria that no slice (the final refinement excepted) cites by its `workflow:criterion` ID or its text.
// Plain text matching keeps this deterministic; a miss only sends the planner to cite the criterion, never blocks a merge.
const squash = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
function uncoveredCriteria(epic, slices) {
  const section = (epic.body || '').match(/^#{2,4} Acceptance criteria\s*$([\s\S]*?)(?=^#{1,4} |(?![\s\S]))/mi)?.[1] || '';
  // Once every slice is closed, the Reviewer's outcome judgement owns the criteria.
  if (!slices.some(slice => slice.state === 'OPEN')) return [];
  const bodies = slices.filter(slice => !(slice.body || '').includes(refinementMarker)).map(slice => squash(slice.body));
  return section.split('\n').flatMap(line => {
    const m = line.match(/^\s*[-*] \[ \] (.+?)\s*(?:<!-- workflow:criterion ([A-Za-z0-9._-]+) -->.*)?$/);
    if (!m) return [];
    const text = squash(m[1]);
    return bodies.some(body => body.includes(text) || (m[2] && body.includes(m[2].toLowerCase()))) ? [] : [{ id: m[2] || null, text: m[1] }];
  });
}
export function decideEpic({ epic, slices }) {
  if (epic.state !== 'OPEN') return { done: { epic: epic.number } };
  if ((epic.labels || []).some(label => (label.name ?? label) === 'lane:owner')) return { owner: `epic #${epic.number} waits for the owner's approval`, url: epic.url };
  if (!slices.length) return agent('planner', 'slice', { reason: 'the epic has no slices' });
  const uncovered = uncoveredCriteria(epic, slices);
  if (uncovered.length) return agent('planner', 'slice', { reason: `epic criteria no slice covers: ${uncovered.map(c => c.id || c.text).join(', ')}`, uncovered });
  const dropped = slices.filter(slice => slice.state === 'OPEN' && slice.dropped?.length);
  if (dropped.length) return { owner: `epic #${epic.number}: ${dropped.map(slice => droppedReason(slice.number, slice.dropped)).join('; ')}`, url: epic.url };
  const cycle = findCycle(slices.filter(slice => slice.state === 'OPEN'));
  if (cycle) return { owner: `epic #${epic.number}: dependency cycle ${cycle.map(n => `#${n}`).join(' → ')}`, url: epic.url };
  const ordered = dependencyOrder(slices);
  if (!ordered.length) return { do: 'close-epic' };
  const ready = ordered.filter(slice => !slice.blockers.length).map(slice => slice.number);
  return ready.length ? { slices: ready } : { owner: `epic #${epic.number}: no open slice is unblocked (${ordered.map(s => `#${s.number} by ${s.blockers.map(n => `#${n}`).join(', ')}`).join('; ')})`, url: epic.url };
}
// Among ready slices, drive the first that needs work now; a slice only waiting or held for the owner yields.
export function pickSlice(entries) {
  const rank = step => (step.do || step.agent ? 0 : step.wait ? 1 : step.owner || step.blocked ? 2 : 3);
  return [...entries].sort((a, b) => rank(a.step) - rank(b.step))[0] || null;
}

// Each merge sends an epic's other ready PRs behind their base again, so one PR at a time brings the base in, the oldest
// first, and none while another ready PR of the epic is on its way to merge (CI, review, auto-merge); the rest are held.
export function holdBaseUpdates(entries) {
  const behind = entries.filter(entry => entry.step.do === 'update-branch').sort((a, b) => a.pr.number - b.pr.number);
  if (!behind.length) return entries;
  const merging = entries.find(entry => entry.pr?.state === 'OPEN' && !entry.pr.isDraft && !behind.includes(entry) && (entry.step.wait || entry.step.do === 'auto-merge' || entry.step.agent === 'reviewer'));
  const first = merging ? null : behind[0];
  const reason = `brings the base in after PR #${(merging || first).pr.number} ${merging ? 'merges' : 'is updated'}`;
  return entries.map(entry => (behind.includes(entry) && entry !== first ? { ...entry, step: { blocked: { issue: entry.number, reason } } } : entry));
}

const shellQuote = value => '\'' + value.replaceAll('\'', '\'\\\'\'') + '\'';
export function implementerBrief(f) {
  const fix = f.step.mode === 'fix';
  return `# Implementer brief: #${f.issue.number} ${f.issue.title}

Mode: ${f.step.mode}${f.step.reason ? ` (${f.step.reason})` : ''}. Risk ${f.risk}. Model ${f.model || modelForStep(f.step, f.risk, f.round)}. Effort ${f.effort || sessionFor(f.step.agent, f.risk, { round: f.round, fresh: Boolean(f.step.fresh) }).effort}.${f.step.outOfScope?.length ? `
Out of scope: ${f.step.outOfScope.join(', ')}. Revert each of these paths (the issue's scope packet does not cover them), or hand back \`replan\` naming why the issue needs them.` : ''}
Issue: ${f.issue.url}
Plugin: workflow ${pluginVersion() ?? 'unknown'} (the CLI's own version; the skills you load must match it).
Worktree: ${f.tree.path} (branch ${f.tree.branch}, base origin/${f.base})
PR: ${f.pr ? `${f.pr.url} at ${f.pr.headRefOid}, round ${f.round}` : 'none yet; drive opens it'}

## Task

${f.step.handoff ? `Handoff: a fresh session takes over this PR because the risk changed the model. Start from the open findings (\`review-context\` lists them), the branch above and the last hand-back${f.handBack?.status ? ` (status ${f.handBack.status}${f.handBack.note ? `: ${f.handBack.note}` : ''})` : ''}. ` : ''}${!fix ? 'Deliver the issue below so every acceptance criterion holds, with focused tests.' : /base conflict|conflicts with its base/.test(f.step.reason || '') ? `Merge the base with \`git merge --no-ff --no-commit origin/${f.base}\`, resolve conflicts and commit the merge.` : f.step.fresh ? 'Earlier fix rounds did not converge. Read every open Blocker and Important thread `review-context` lists and the issue\'s criteria, find their shared cause and fix it whole, with the neighbouring cases the same cause breaks, each with a focused test. Fix nothing outside the criteria; Nits never block.' : 'Fix the failing check or the Blocker and Important findings of the newest review; `review-context` lists the open threads. Fix nothing else; Nits never block.'}${fix && f.step.findings?.length ? ` Blocking findings to fix (the head is unchanged until a new commit fixes each):\n${f.step.findings.map(finding => `- ${finding}`).join('\n')}\n` : ''} Set cwd to ${f.tree.path} for every command. Work only in that worktree. Run one plain command per Bash call.

## Commands you may run

- \`node ${cli} check --worktree ${shellQuote(f.tree.path)}\`: the project gate, under the machine-wide lock. It must pass before you hand back \`done\`.
- \`node ${cli} commit --message "<Conventional Commit subject>" -- <paths>\`
${fix ? `- \`node ${cli} status ${f.pr.number}\` and \`node ${cli} review-context --pr ${f.pr.number}\`\n` : ''}
Never push, open, label, ready or merge a PR, and never start an agent: drive does that.

## Hand-back, at most 5 lines

\`\`\`text
status: done | replan | blocked
commit: <Conventional Commit subject, only if you left changes uncommitted>
paths: <changed file paths only, not directories; drive commits only explicit files>
check: pass | fail
note: <one line: what changed, or why replan or blocked>
body: <optional absolute path to a Markdown evidence file>
usage: <optional, when the host reports it: in=N out=N cache=N cost=USD model=M effort=E host=H plugin=V>
\`\`\`

## Issue

${f.issue.body || '(no body)'}
`;
}
// `workflow commit` accepts only a Conventional Commit subject, merge commits included.
export const mergeCommitMessage = (base, branch) => `chore: merge origin/${base} into ${branch}`;
export function conflictResolverBrief(f) {
  return `# Conflict-resolver brief: #${f.issue.number} ${f.issue.title}

Mode: resolve (${f.step.reason}). Risk ${f.risk}. Model ${f.model}. Effort ${f.effort}.
Issue: ${f.issue.url}
Plugin: workflow ${pluginVersion() ?? 'unknown'} (the CLI's own version; the skills you load must match it).
Worktree: ${f.tree.path} (branch ${f.tree.branch}, base origin/${f.base})
PR: ${f.pr ? `${f.pr.url} at ${f.pr.headRefOid}` : 'none'}

## Task

Drive merged origin/${f.base} into this branch with \`git merge --no-ff --no-commit\`; the merge is in progress with conflicts${f.step.conflicts?.length ? ` in ${f.step.conflicts.join(', ')}` : ''}. Resolve every conflict mechanically, keeping both sides' intent, then stage the files. Never rebase, abort, reset or force-push. If a conflict needs a judgment about behavior, hand back \`blocked\`: the implementer takes over the merge. Set cwd to ${f.tree.path} for every command. Work only in that worktree. Run one plain command per Bash call.

## Commands you may run

- \`node ${cli} check --worktree ${shellQuote(f.tree.path)}\`: the project gate, under the machine-wide lock. It must pass before you hand back \`done\`.
- \`node ${cli} commit --message "${mergeCommitMessage(f.base, f.tree.branch)}" -- <resolved paths>\`

Never push, open, label, ready or merge a PR, and never start an agent: drive does that.

## Hand-back, at most 6 lines

\`\`\`text
agent: conflict-resolver
status: done | blocked
commit: ${mergeCommitMessage(f.base, f.tree.branch)}
paths: <resolved file paths only, not directories>
check: pass | fail
note: <one line: how each conflict was resolved, or why blocked>
\`\`\`

## Issue

${f.issue.body || '(no body)'}
`;
}
export function devopsBrief(f) {
  const last = f.pr ? f.prAssessment : null;
  return `# Risk brief: #${f.issue.number} ${f.issue.title}

Task: risk. Assess ${f.pr ? `the diff of PR #${f.pr.number} at head ${f.pr.headRefOid}` : 'this issue before its build'} by the factors in ${riskGuide}, and set R0, R1 or R2 with a one-line reason (${f.step.reason}).
Issue: ${f.issue.url}
Plugin: workflow ${pluginVersion() ?? 'unknown'} (the CLI's own version; the skills you load must match it).
${f.pr ? `PR: ${f.pr.url}. Read the diff with \`gh pr diff ${f.pr.number} --repo ${f.repo}\`; it changes ${f.diffPaths.length} files: ${f.diffPaths.join(', ') || 'none listed'}.` : 'Read the issue below, its scope packet and the code it names.'}
${last ? `The last assessment set ${last.risk} at ${String(last.head || '').slice(0, 7)}: ${last.reason}` : ''}
${f.floor ? `The issue's owner-set \`risk:${f.floor}\` is a floor drive applies after you; assess the change on its own.` : ''}

Read code, CODEOWNERS and the repository's rules as evidence; never edit, commit or push, never label or comment, never start an agent and never print a token. Drive sets the label and posts your reason.

## Hand-back, exactly 2 lines

\`\`\`text
risk: R0 | R1 | R2
reason: <one line: concrete failure, recovery steps and financial impact, with evidence or unknowns>
\`\`\`

## Issue

${f.issue.body || '(no body)'}
`;
}
export function improverBrief(f) {
  return `# Improvement brief: epic #${f.issue.number} ${f.issue.title}

Invoke the \`improve\` skill for process lessons from the delivered epic ${f.issue.url}. Follow its idempotency and recording steps; the refinement PR has merged. Return its output in at most 5 lines.
Plugin: workflow ${pluginVersion() ?? 'unknown'} (the CLI's own version; the skills you load must match it).
`;
}
function epicOutcomeBrief(f) {
  return `# Reviewer brief: epic #${f.issue.number} outcome review

Plugin: workflow ${pluginVersion() ?? 'unknown'} (the CLI's own version; the skills you load must match it).

Task: post the epic outcome comment for ${f.issue.url} (review skill, references/epic-outcome.md). ${f.step.reason}.
Read the epic, its linked children (\`gh api repos/${f.repo}/issues/${f.issue.number}/sub_issues\`) and the PRs merged into ${f.base} that closed them. Judge each criterion against the merged code and cite those PRs; mark one \`unmet\` or \`unverifiable\` when the evidence does not show it, with a concrete \`nextAction\`. Post the comment with \`GH_TOKEN=$(gh auth token --user <identities.reviewer>) gh api repos/${f.repo}/issues/${f.issue.number}/comments -F body=@<file>\` (the CLI's \`issue comment\` posts as the implementer), never printing the token. Never edit, commit or push, never start an agent and never print a token.

## Hand-back, at most 5 lines

epic, the comment link, one \`met\`/\`unmet\`/\`unverifiable\` count per state.

## Epic

${f.issue.body || '(no body)'}
`;
}
export function reviewerBrief(f) {
  if (f.step.mode === 'epic-outcome') return epicOutcomeBrief(f);
  return `# Reviewer brief: PR #${f.pr.number} for #${f.issue.number}

${f.packet ? `Read the review packet first: ${f.packet}. It holds the issue criteria, CI, the project gate, the diff by area, the delta since your last verdict with open threads, and call sites of changed exports. Do not re-gather them; check blast radius outside it yourself.\n\n` : ''}Task: ${f.step.mode === 'approve' ? 'approve a ready PR whose newest verdict at its head is `ready` (review skill, references/approval.md)' : 'review the draft at its head (review skill, steps 1 to 5)'}.
PR: ${f.pr.url} at head ${f.pr.headRefOid}; round ${f.step.round}; risk ${f.risk}. Issue: ${f.issue.url}
Plugin: workflow ${pluginVersion() ?? 'unknown'} (the CLI's own version; the skills you load must match it).
${f.step.sameHead ? 'Same head: the implementer completed a fix without a commit. Review the updated evidence and open findings again.\n' : f.step.narrowed ? 'Narrowed scope, same head: the planner narrowed the issue to what this head delivers. Re-judge each of your open blocking threads against the issue as it now reads, pass each one outside it as `--resolve-thread`, and post a new verdict.\n' : f.step.round > 1 ? 'Later round: judge only the delta `review-context` returns as `comparison`, your open threads and the criteria. If no earlier verdict of yours reviewed the whole diff (it was a red-CI or shape-only verdict), review the whole diff at head instead.\n' : ''}
## Commands you may run, one plain command per Bash call

- \`node ${cli} review-context --pr ${f.pr.number} --issue ${f.issue.number} --claim\`
- \`node ${cli} wait ${f.pr.number} --until ci\`, \`node ${cli} status ${f.pr.number}\`, \`node ${cli} scratch\`
- \`node ${cli} review-post --pr ${f.pr.number} --sha ${f.pr.headRefOid} --event COMMENT|APPROVE --body-file <F> [--comments-file <C>] [--resolve-thread <id>]...\`
${f.step.mode === 'approve' ? `- \`node ${cli} pr auto-merge --pr ${f.pr.number}\` as the Reviewer\n` : ''}
Never edit, commit or push, never start an agent and never print a token.

## Hand-back, at most 5 lines

verdict, PR, head, round, tag counts.
`;
}
export function plannerBrief(f) {
  return `# Planner brief: #${f.issue.number} ${f.issue.title}

Task: ${f.step.mode === 'consolidate' ? `${f.step.reason}. Merge the overlapping unstarted issues ${f.step.overlaps.map(n => `#${n}`).join(', ')} and #${f.issue.number} into one canonical issue that carries every outcome, criterion, dependency, decision and milestone; close the others as not planned after appending \`<!-- workflow:consolidated-into N -->\` (N is the canonical issue) to each body and commenting where its content went, then hand back \`consolidated\` with \`into\` and \`closed\`. Split only for an independent outcome, a meaningful dependency, an authority boundary or a delivery constraint, never by size. Never merge a started issue, one with an open PR, issues in different epics without a shared outcome, or anything under \`lane:owner\`. When they are distinct outcomes, append \`${distinctMarker('M')}\` to #${f.issue.number} for each other issue M (and say why in a comment) and hand back \`distinct\`` : f.step.mode === 'slice' ? 'slice this approved epic into sub-issues, each deliverable alone, with blocked-by links between dependent slices. Invoke the `plan` skill to create the final refinement slice' + (f.step.uncovered?.length ? `. Epic criteria no slice covers yet: ${f.step.uncovered.map(c => `\`${c.id || c.text}\` (${c.text})`).join('; ')}. Add slices for them, each citing its criterion's ID or exact text in its body, or tick a criterion the epic already delivers` : '') : f.pr ? `${f.step.reason}; narrow this issue's criteria to what PR #${f.pr.number} delivers at its head, and move the unmet criteria to a new issue under the same epic, blocked by this one. Ignore base conflicts when narrowing scope; the implementer merges the base. Hand back \`narrowed\`: the Reviewer then judges the same head against the narrowed criteria and the PR merges closing this issue. Never close the PR` : `${f.step.reason}; split the issue at its logical seam into an epic with one-PR sub-issues (spec's split.md: set \`type:epic\` first) and hand back \`sliced\``}. Invoke the \`spec\` skill for the issue form.
Issue: ${f.issue.url}
Plugin: workflow ${pluginVersion() ?? 'unknown'} (the CLI's own version; the skills you load must match it).
Commands: \`node ${cli} issue create --title T --body-file PATH [--milestone NAME] [--parent N] [--blocked-by N,M]\`, \`node ${cli} issue edit --number N [--body-file PATH] [--milestone NAME] [--parent N] [--blocked-by N,M]\` (milestone, sub-issue link and blocked-by links, each confirmed from GitHub) and \`node ${cli} issue comment --number N --body-file PATH\`. Never run raw \`gh\`.
Never write code and never start an agent. Slices follow the epic's approved outcome; the owner decides epic-level outcomes only.

## Hand-back, at most 5 lines

status: sliced | narrowed | consolidated | distinct | blocked
slices: <issue numbers, or the new issue when narrowed>
into: <the canonical issue, when consolidated>
closed: <issue numbers closed as consolidated into it>
note: <one line>

## Issue

${f.issue.body || '(no body)'}
`;
}
// The Reviewer runs as a separate non-interactive session, so the session that wrote the PR never approves it.
export function reviewerCommand(model, brief, name, host = 'claude', executable = host, effort = null) {
  if (host === 'codex') return [executable, 'exec', '--json', '-m', model, ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []), `Read ${fileURLToPath(new URL('../../skills/review/SKILL.md', import.meta.url))}, then follow your brief at ${brief}. Return at most 5 lines.`];
  if (host !== 'claude') throw new Error('Unsupported reviewer host');
  return [executable, '--print', '--output-format', 'json', '--agent', 'filipkrawiec-workflow:reviewer', '--model', model, ...(effort ? ['--effort', effort] : []), '--plugin-dir', pluginRoot.replace(/\/$/, ''), '--permission-mode', 'auto', '--name', name, `Follow your brief at ${brief}. Return at most 5 lines.`];
}
export const waitCommandFor = (pr, until) => ['node', cli, 'wait', String(pr), '--until', until];

export function updatePrBody(body, hb, evidence) {
  let result = body;
  if (hb.note) result = result.replace(/(## Change\n\n)[\s\S]*?(?=\n## |$)/, (_, heading) => `${heading}${hb.note}\n`);
  if (evidence !== undefined) {
    const section = `<!-- workflow:evidence-start -->\n## Evidence\n\n${evidence.trim()}\n<!-- workflow:evidence-end -->\n`;
    if (result.includes('<!-- workflow:evidence-start -->')) result = result.replace(/<!-- workflow:evidence-start -->[\s\S]*?<!-- workflow:evidence-end -->\n?/, () => section);
    else if (/^## Evidence[^\S\n]*$/m.test(result)) result = result.replace(/^## Evidence[^\S\n]*(?:\n|$)[\s\S]*?(?=^## |(?![\s\S]))/m, () => `${section}\n`);
    else result += `\n${section}`;
  }
  return result;
}

export function prBody(issue, risk, hb, subjects, evidence) {
  return `Closes #${issue.number}

## Problem

${issue.title} (#${issue.number}).

## Change

${hb.note || subjects.map(subject => `- ${subject}`).join('\n') || 'See the commits.'}

## Verification

The implementer ran the project gate with \`workflow.mjs check\`: ${hb.check || 'unreported'}.

Initial risk ${risk}; the independent assessment of this diff follows as a PR comment.
${evidence === undefined ? '' : `\n<!-- workflow:evidence-start -->\n## Evidence\n\n${evidence.trim()}\n<!-- workflow:evidence-end -->\n`}`;
}

export function slugBranch(issue) {
  const words = issue.title.replace(/^\w+(\([^)]*\))?!?:\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 5);
  return `${issue.number}-${words.join('-')}`.slice(0, 48).replace(/-+$/, '');
}

// ---- GitHub and Git reads and writes; tests inject `io` in their place.

function gitIn(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnvironment() });
  return result.status === 0 ? result.stdout.trim() : null;
}
// Version and manifest files are generated from the base's version: a conflict in only these takes the base's side and
// re-syncs the manifests, with no model. Merging the base into the head is never a rebase, so review threads stay attached.
export const isManifestPath = path => /(^|\/)(package-metadata|plugin|marketplace|plugins)\.json$/.test(path);
export function mergeBaseIntoHead({ path, base, git = args => spawnSync('git', args, { cwd: path, encoding: 'utf8', env: cleanEnvironment() }), syncManifests, commit }) {
  const merged = git(['merge', '--no-ff', '--no-commit', `origin/${base}`]);
  const inProgress = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0;
  if (merged.status === 0) { if (inProgress) commit(); return { conflicts: [], committed: inProgress }; }
  const conflicts = git(['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter(Boolean);
  if (!conflicts.length) { git(['merge', '--abort']); throw new Error(`git merge origin/${base} failed: ${String(merged.stderr).trim()}`); }
  if (!conflicts.every(isManifestPath)) return { conflicts, committed: false };
  for (const file of conflicts) { git(['checkout', '--theirs', '--', file]); git(['add', '--', file]); }
  syncManifests(); git(['add', '-u']); commit();
  return { conflicts, committed: true, manifest: true };
}
function self(args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 2, 2], env: process.env });
  if (result.status !== 0) throw new Error(`${args.slice(0, 2).join(' ')} failed in ${cwd}`);
}
// Call sites of the exports a diff adds, found with git grep at head; shared with the reviewer benchmark so its packet matches drive's.
export function changedExportSites({ files, diffs, head, git }) {
  const callSites = [];
  for (const file of files) {
    for (const symbol of exportedSymbols(diffs[file.path] || '')) {
      const hits = git('grep', '-n', '-w', '-F', '-e', symbol, head).split('\n').map(line => line.slice(head.length + 1)).filter(line => line && !line.startsWith(`${file.path}:`));
      callSites.push({ symbol, file: file.path, sites: hits });
    }
  }
  return callSites.slice(0, 20);
}
// What the review packet reads, gathered from GitHub and the worktree at the PR's head; the PR description and the hand-back are never read.
function gatherPacketFacts({ repo, lanes, gh, threads, issue, pr, tree, round }) {
  const head = pr.headRefOid; const base = `origin/${lanes.base}`; const range = `${base}...${head}`;
  const git = (...args) => gitIn(tree.path, args) || '';
  const checks = (pr.statusCheckRollup || []).map(check => {
    const state = checkState(check);
    let excerpt = null;
    if (failedStates.includes(state)) {
      const run_ = /\/actions\/runs\/(\d+)/.exec(check.detailsUrl || '')?.[1];
      if (run_) { try { excerpt = run('gh', ['run', 'view', run_, '--repo', repo, '--log-failed']).split('\n').slice(-40).join('\n'); } catch { excerpt = '(failing log unavailable)'; } }
    }
    return { name: check.name || check.context, state, excerpt };
  });
  let gate = null;
  try { gate = JSON.parse(readFileSync(join(tree.path, '.wf', 'gate.json'), 'utf8')); } catch { /* no recorded gate */ }
  const files = (pr.files || []).filter(file => typeof file?.path === 'string');
  const diffs = {};
  for (const file of files) if (!(file.changeType === 'RENAMED' && !file.additions && !file.deletions)) diffs[file.path] = git('diff', range, '--', file.path);
  const prior = previousReviewedHead(pr.reviews, lanes.reviewer, head);
  let previous = null;
  if (prior) {
    try { previous = { sha: prior, files: git('diff', '--name-only', prior, head).split('\n').filter(Boolean), diff: git('diff', prior, head) }; } catch { previous = { sha: prior, files: [], diff: '(delta unavailable: fetch the earlier head)' }; }
  }
  let found = [];
  try { found = threads(pr).nodes.map(thread => ({ path: thread.path, line: thread.line, isResolved: thread.isResolved, isOutdated: thread.isOutdated, body: thread.comments?.nodes?.[0]?.body })); } catch { /* threads unavailable */ }
  const callSites = changedExportSites({ files, diffs, head, git });
  return { issue: { url: issue.url, body: issue.body }, pr: { number: pr.number, url: pr.url, head, base }, round, requiredChecks: lanes.requiredChecks || [], checks, gate, files, diffs, range, previous, threads: found, callSites };
}
export function githubIo(lanes, gh = args => jsonCommand('gh', args)) {
  const repo = lanes.repo;
  const trees = () => parseWorktreeList(git('worktree', 'list', '--porcelain'));
  const openIssues = () => gh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', 'number,labels,body']);
  const io = {
    issue: n => gh(['issue', 'view', String(n), '--repo', repo, '--json', 'number,url,state,stateReason,title,body,labels,assignees,milestone']),
    dependencies: issue => readDependencies(repo, issue, gh),
    allBlockers: n => gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${n}/dependencies/blocked_by?per_page=100`]).flat().map(dep => dep.number),
    addBlocker: (n, blocker) => {
      const id = gh(['api', `repos/${repo}/issues/${blocker}`]).id;
      run('gh', ['api', '--method', 'POST', `repos/${repo}/issues/${n}/dependencies/blocked_by`, '-F', `issue_id=${id}`]);
    },
    mergedClosingPr: (n, base) => {
      const [owner, name] = repo.split('/');
      const query = `query($owner:String!,$name:String!,$number:Int!) { repository(owner:$owner,name:$name) { issue(number:$number) { closedByPullRequestsReferences(first:100) { nodes { merged baseRefName } } } } }`;
      const data = gh(['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${n}`]);
      return data.data.repository.issue.closedByPullRequestsReferences.nodes.some(pr => pr.merged && pr.baseRefName === base);
    },
    consolidatedDelivery: (epic, child, base) => verifyConsolidatedDelivery({ epic, child, repo, base }, {
      mergedPr: (number, target) => {
        const pr = gh(['api', `repos/${repo}/pulls/${number}`]);
        return pr.number === number && pr.merged === true && pr.base?.ref === target && pr.base?.repo?.full_name?.toLowerCase() === repo.toLowerCase();
      }
    }),
    hasLessons: n => gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${n}/comments?per_page=100`]).flat().some(comment => /^## Lessons\s*$/m.test(comment.body || '')),
    createRefinement: epic => {
      const scope = (epic.body || '').match(/```scope\s*\n[\s\S]*?```/)?.[0] || '```scope\n{"paths":[]}\n```';
      const body = `${refinementMarker}\n\n## Outcome\nReview and refine the merged whole epic #${epic.number}.\n\n### Acceptance criteria\n${refinementCriteria.map(line => `- [ ] ${line}`).join('\n')}\n\n${scope}`;
      const [owner, name] = repo.split('/');
      const lookup = `query($owner:String!,$name:String!,$number:Int!) { repository(owner:$owner,name:$name) { id issue(number:$number) { id milestone { id } } } }`;
      const data = gh(['api', 'graphql', '-f', `query=${lookup}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${epic.number}`]).data.repository;
      const mutation = `mutation($repository:ID!,$parent:ID!,$title:String!,$body:String!,$milestone:ID) { createIssue(input:{repositoryId:$repository,parentIssueId:$parent,title:$title,body:$body,milestoneId:$milestone}) { issue { number } } }`;
      const result = gh(['api', 'graphql', '-f', `query=${mutation}`, '-f', `repository=${data.id}`, '-f', `parent=${data.issue.id}`, '-f', `title=refine: ${epic.title}`, '-f', `body=${body}`, ...(data.issue.milestone ? ['-f', `milestone=${data.issue.milestone.id}`] : [])]);
      const number = result.data.createIssue.issue.number;
      return gh(['issue', 'view', String(number), '--repo', repo, '--json', 'number,url,state,title,body,labels,assignees,milestone']);
    },
    editEpicBody: (epic, body) => { run('gh', ['issue', 'edit', String(epic.number), '--repo', repo, '--body', body]); },
    uncheckEpicCriteria: (epic, ids) => {
      const body = epic.body.replace(/^(\s*[-*] \[[ xX]\] .+?\s*<!-- workflow:criterion ([A-Za-z0-9._-]+) -->.*)$/gm, (line, whole, id) => ids.includes(id) ? line.replace(/\[[xX]\]/, '[ ]') : line);
      if (body !== epic.body) run('gh', ['issue', 'edit', String(epic.number), '--repo', repo, '--body', body]);
    },
    createEpicFollowUp: (epic, criterion) => {
      const [owner, name] = repo.split('/');
      const lookup = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){id issue(number:$number){id milestone{id}}}}';
      const data = gh(['api', 'graphql', '-f', `query=${lookup}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${epic.number}`]).data.repository;
      const mutation = 'mutation($repository:ID!,$parent:ID!,$title:String!,$body:String!,$milestone:ID){createIssue(input:{repositoryId:$repository,parentIssueId:$parent,title:$title,body:$body,milestoneId:$milestone}){issue{number}}}';
      const body = `<!-- workflow:epic-follow-up ${epic.number} ${criterion.id} -->\n\n## Outcome\n${criterion.nextAction}\n\n### Acceptance criteria\n- [ ] ${criterion.nextAction}`;
      const result = gh(['api', 'graphql', '-f', `query=${mutation}`, '-f', `repository=${data.id}`, '-f', `parent=${data.issue.id}`, '-f', `title=Follow up: ${criterion.text}`, '-f', `body=${body}`, ...(data.issue.milestone ? ['-f', `milestone=${data.issue.milestone.id}`] : [])]);
      return gh(['issue', 'view', String(result.data.createIssue.issue.number), '--repo', repo, '--json', 'number,url,state,title,body,labels,assignees,milestone']);
    },
    subIssues: n => gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${n}/sub_issues?per_page=100`]).flat().map(sub => ({ number: sub.number, state: sub.state.toUpperCase() })),
    verifyEpic: (epic, slices, base, merged) => verifyEpicClosure({ epic, slices, base, repo }, { merged }),
    pr: n => {
      const open = gh(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', 'number,body,closingIssuesReferences,labels,reviews,headRefOid,isDraft']);
      // `prLinkedIssues` also reads a stacked PR's `Closes #N`, which GitHub links no closing issue for.
      const found = open.find(candidate => prRecord({ ...candidate, labels: candidate.labels || [] }, lanes).issues.includes(n));
      return found ? gh(['pr', 'view', String(found.number), '--repo', repo, '--json', `${prFields},files,headRefName`]) : null;
    },
    tree: (n, branch) => {
      const found = trees().find(tree => tree.branch && (tree.branch === branch || tree.branch.startsWith(`${n}-`)));
      if (!found) return null;
      const base = `origin/${lanes.base}`;
      return {
        path: found.path, branch: found.branch,
        dirty: Boolean(gitIn(found.path, ['status', '--porcelain', '--untracked-files=all'])),
        commits: Number(gitIn(found.path, ['rev-list', '--count', `${base}..HEAD`]) || 0),
        unpushed: Boolean(gitIn(found.path, ['log', '--oneline', 'HEAD', '--not', '--remotes'])),
        merging: gitIn(found.path, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']) !== null,
        diffPaths: (gitIn(found.path, ['diff', '--name-only', `${base}...HEAD`]) || '').split('\n').filter(Boolean),
        subjects: (gitIn(found.path, ['log', '--no-merges', '--reverse', '--format=%s', `${base}..HEAD`]) || '').split('\n').filter(Boolean),
      };
    },
    // Drive posts as the implementer identity, so only its comments count as assessments.
    assessment: (issue, pr) => latestAssessment(gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr ? pr.number : issue.number}/comments?per_page=100`]).flat(), lanes.implementer),
    noteTakeover: (number, held, now) => {
      if (!number) return;
      const body = join(workflowScratch(), `drive-${number}-takeover.md`);
      writeFileSync(body, `<!-- workflow:drive-takeover -->\nDrive took over this claim from session \`${held.session}\` at ${new Date(now).toISOString()}: it made no drive progress since ${new Date(held.progressAt ?? held.at).toISOString()}. Resuming from GitHub state.\n`);
      run('gh', ['issue', 'comment', String(number), '--repo', repo, '--body-file', body]);
    },
    assess: (issue, pr, record) => {
      const body = join(workflowScratch(), `drive-${issue.number}-risk.md`);
      writeFileSync(body, assessmentComment(record));
      run('gh', [pr ? 'pr' : 'issue', 'comment', String(pr ? pr.number : issue.number), '--repo', repo, '--body-file', body]);
      if (!pr) return;
      // The new assessment of the diff wins, lower or higher: the PR keeps exactly one risk label.
      const stale = (pr.labels || []).map(label => label.name ?? label).filter(name => /^risk:R\d$/.test(name) && name !== `risk:${record.risk}`);
      run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, ...stale.flatMap(name => ['--remove-label', name]), '--add-label', `risk:${record.risk}`]);
    },
    start: (issue, prBranch) => {
      try { ensureWorkflowLabels(repo); } catch { /* labels may already exist */ }
      // The issue's risk label stays as the owner set it: it is the floor, never drive's estimate.
      run('gh', ['issue', 'edit', String(issue.number), '--repo', repo, '--add-label', 'state:started', ...(lanes.implementer ? ['--add-assignee', lanes.implementer] : [])]);
      const root = trees()[0].path; const branch = prBranch || slugBranch(issue); const path = join(root, '.worktrees', branch);
      git('fetch', '--quiet', 'origin');
      if (!existsSync(path)) {
        const exists = gitIn(root, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]);
        if (exists || prBranch) git('-C', root, 'worktree', 'add', path, branch);
        else git('-C', root, 'worktree', 'add', '-b', branch, path, `origin/${lanes.base}`);
      }
    },
    commit: (tree, message, paths) => self(['commit', '--message', message, '--', ...paths], tree.path),
    mergeBase: tree => mergeBaseIntoHead({ path: tree.path, base: lanes.base, syncManifests: () => self(['manifests', 'sync', tree.path], tree.path), commit: () => self(['commit', '--message', mergeCommitMessage(lanes.base, tree.branch)], tree.path) }),
    push: tree => self(['push'], tree.path),
    open: (issue, tree, risk, hb) => {
      const body = join(workflowScratch(tree.path), `drive-${issue.number}-pr.md`);
      writeFileSync(body, prBody(issue, risk, hb, tree.subjects, hb.body ? readFileSync(hb.body, 'utf8') : undefined));
      const title = /^[a-z]+(?:\([^\n()]+\))?!?:\s+\S/i.test(issue.title) ? issue.title : tree.subjects[0] || issue.title;
      run('gh', ['pr', 'create', '--repo', repo, '--draft', '--base', lanes.base, '--head', tree.branch, '--title', title, '--body-file', body]);
      const pr = gh(['pr', 'view', tree.branch, '--repo', repo, '--json', 'number']);
      run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--add-label', `risk:${risk}`]);
      try { run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--add-reviewer', lanes.reviewer]); } catch { console.error(`drive: could not request ${lanes.reviewer}'s review on #${pr.number}`); }
    },
    updateBody: (pr, tree, hb) => {
      const body = join(workflowScratch(tree.path), `drive-${pr.number}-pr-update.md`);
      writeFileSync(body, updatePrBody(pr.body || '', hb, hb.body ? readFileSync(hb.body, 'utf8') : undefined));
      run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--body-file', body]);
    },
    reviewThreads: pr => {
      const [owner, name] = repo.split('/');
      const query = 'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated path line comments(first:1){nodes{body author{login}}}}}}}}';
      const nodes = []; const seen = new Set(); let after = null;
      for (;;) {
        const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${pr.number}`];
        if (after !== null) args.push('-f', `after=${after}`);
        const threads = gh(args)?.data?.repository?.pullRequest?.reviewThreads;
        if (!Array.isArray(threads?.nodes) || typeof threads.pageInfo?.hasNextPage !== 'boolean') throw new Error('Cannot read review threads');
        nodes.push(...threads.nodes);
        if (!threads.pageInfo.hasNextPage) return { nodes, pageInfo: threads.pageInfo };
        const cursor = threads.pageInfo.endCursor;
        if (typeof cursor !== 'string' || !cursor || seen.has(cursor)) throw new Error('Cannot paginate review threads');
        seen.add(cursor); after = cursor;
      }
    },
    recordUsage: (pr, hb) => {
      const parsed = parseUsageLine(hb.usage);
      const role = handBackRole(hb);
      const key = createHash('sha1').update([pr.number, pr.headRefOid, role, hb.status, hb.usage, hb.note, hb.commit].join('\0')).digest('hex').slice(0, 12);
      recordUsage({ repo, pr: pr.number, author: lanes.implementer, entry: usageEntry({ role, host: parsed?.host, model: parsed?.model, effort: parsed?.effort, plugin: parsed?.plugin, usage: parsed?.usage, key }) }, { gh });
    },
    packetFacts(context) { return gatherPacketFacts({ repo, lanes, gh, threads: pr => this.reviewThreads(pr), ...context }); },
    reviewSession: (pr, tree) => {
      const root = tree?.path || git('rev-parse', '--show-toplevel');
      try { const session = sessionClaim(root, repo, lanes.reviewer, pr.number); return session ? { oid: session.oid, dead: localClaimIsDead(session, session.claim?.head), startedAt: session.claim?.startedAt } : null; } catch { return { unavailable: true }; }
    },
    reviewPostFailed: (pr, since) => {
      if (!since) return false;
      const comments = gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr.number}/comments?per_page=100`]).flat();
      const lastVerdict = Math.max(0, ...(pr.reviews || []).filter(review => review.author?.login?.toLowerCase() === lanes.reviewer?.toLowerCase() && /<!-- agent-review\b[^>]*\bverdict=/.test(review.body || '')).map(review => Date.parse(review.submittedAt || '') || 0));
      return comments.some(comment => comment.user?.login?.toLowerCase() === lanes.reviewer?.toLowerCase() && Date.parse(comment.created_at || '') >= since && Date.parse(comment.created_at || '') > lastVerdict && comment.body?.includes(`<!-- agent-review post-failed sha=${pr.headRefOid} -->`));
    },
    // When `state:reviewing` was last added to the PR, from its timeline; null when it never was.
    reviewingSince: pr => {
      const events = gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr.number}/timeline?per_page=100`]).flat();
      const at = events.filter(event => event.event === 'labeled' && event.label?.name === 'state:reviewing').at(-1)?.created_at;
      return at ? Date.parse(at) : null;
    },
    linkIssue: (pr, issue) => run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--body', `Closes #${issue.number}\n\n${pr.body || ''}`]),
    releaseReview: (pr, tree, claim) => {
      if (claim && !releaseSessionClaim(tree.path, repo, lanes.reviewer, pr.number, claim)) throw new Error('Reviewer claim changed; retry');
      if ((pr.labels || []).some(label => label.name === 'state:reviewing')) run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--remove-label', 'state:reviewing']);
    },
    risk: (pr, from, to) => run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, ...(from ? ['--remove-label', `risk:${from}`] : []), '--add-label', `risk:${to}`]),
    ready: (pr, tree) => self(['pr', 'ready', '--pr', String(pr.number)], tree?.path || process.cwd()),
    approve: (pr, round) => approveReady({ root: git('rev-parse', '--show-toplevel'), repo, login: lanes.reviewer, pr: pr.number, sha: pr.headRefOid, round }),
    unclaim: issue => run('gh', ['issue', 'edit', String(issue.number), '--repo', repo, ...stateLabels(issue).flatMap(name => ['--remove-label', name])]),
    // A merge, never a rebase: the open PR keeps its review threads. Runs as the session's identity, the implementer.
    syncTree: tree => { if (gitIn(tree.path, ['fetch', '--quiet', 'origin', tree.branch]) !== null) gitIn(tree.path, ['merge', '--ff-only', '--quiet', 'FETCH_HEAD']); },
    disableAutoMerge: pr => run('gh', ['pr', 'merge', String(pr.number), '--repo', repo, '--disable-auto']),
    updateBranch: pr => run('gh', ['pr', 'update-branch', String(pr.number), '--repo', repo]),
    strictPolicy: () => {
      const read = endpoint => { try { return gh(['api', `repos/${repo}/${endpoint}`]); } catch { return null; } };
      const policy = effectiveBranchPolicy(read(`branches/${encodeURIComponent(lanes.base)}/protection`), read(`rules/branches/${encodeURIComponent(lanes.base)}?per_page=100`));
      return !!lanes.requiredChecks?.length && lanes.requiredChecks.every(name => policy?.strictChecks?.includes(name));
    },
    autoMerge: (pr, tree) => self(['pr', 'auto-merge', '--pr', String(pr.number)], tree?.path || process.cwd()),
    close: issue => {
      const current = gh(['issue', 'view', String(issue.number), '--repo', repo, '--json', 'state']);
      if (current.state === 'OPEN') run('gh', ['issue', 'close', String(issue.number), '--repo', repo, '--reason', 'completed']);
    },
    board: (n, value) => board(lanes, n, value),
    // A repository with no board skips the step (boardStatus returns false and says so); any other failure throws.
    requiredBoard: (n, value) => { boardStatus({ ...lanes, project: cachedGithubMetadata(lanes.repo).project }, n, value, false); },
    closeEpic: epic => run('gh', ['issue', 'close', String(epic.number), '--repo', repo, '--reason', 'completed']),
    removeTree: tree => {
      const all = trees(); const root = all[0].path;
      const listed = all.find(candidate => candidate.path === tree.path);
      if (!listed) return;
      const facts = worktreeFacts(listed, { root, current: git('rev-parse', '--show-toplevel'), baseRef: `refs/remotes/origin/${lanes.base}`, prs: new Map(), busy: busyPaths() });
      if (facts.current || facts.busy) { console.error(`drive: kept ${tree.path}; a process works in it`); return; }
      removeWorktree(facts, { deleteBranch: true }, root, `refs/remotes/origin/${lanes.base}`);
    },
    scratch: tree => workflowScratch(tree?.path),
    write: (path, text) => writeFileSync(path, text),
    // The brief drive wrote when it last started this role; null when none, so a first dispatch never hands off.
    read: path => { try { return readFileSync(path, 'utf8'); } catch { return null; } },
    openIssues,
    notifyOwner: (n, step) => {
      const text = `${step.owner}${step.url ? ` ${step.url}` : ''}`;
      const marker = `<!-- workflow:owner-step ${createHash('sha1').update(text).digest('hex').slice(0, 12)} -->`;
      const comments = gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${n}/comments?per_page=100`]).flat();
      const last = comments.filter(comment => /<!-- workflow:owner-step [0-9a-f]+ -->/.test(comment.body || '')).at(-1);
      if (last?.body?.includes(marker)) return;
      run('gh', ['issue', 'comment', String(n), '--repo', repo, '--body', `${marker}\n**Owner step (drive):** ${step.owner}${step.url ? `\n\n${step.url}` : ''}\n\nDecision: the owner acts on the link above, then \`drive ${n}\` continues.`]);
    },
    // The unstarted issues `issue` overlaps; GitHub is read only for those whose scope paths overlap.
    overlaps: issue => findOverlaps(issue, openIssues(), {
      parentOf: n => { try { return gh(['api', `repos/${repo}/issues/${n}/parent`]).number ?? null; } catch { return null; } },
      hasPr: n => Boolean(io.pr(n)),
      blockedBy: n => io.allBlockers(n),
    }),
  };
  return io;
}
function board(lanes, number, value) {
  try { boardStatus({ ...lanes, project: cachedGithubMetadata(lanes.repo).project }, number, value, true); } catch (error) { console.error(`drive: board status skipped for #${number}: ${error.message}`); }
}

// ---- The driver: read, decide, act, until a terminal instruction comes out.

function readIssueFacts(io, n, handBack) {
  const issue = io.issue(n);
  if (issue.state !== 'OPEN') return { issue, tree: io.tree(n), pr: null };
  const pr = io.pr(n);
  const tree = io.tree(n, pr?.headRefName);
  const { blockers, dropped } = splitDependencies(io.dependencies(issue));
  const diffPaths = [...new Set([...(tree?.diffPaths || []), ...(pr?.files || []).map(file => file.path)])];
  const claimed = (pr?.labels || []).some(label => label.name === 'state:reviewing');
  const reviewingSince = pr?.state === 'OPEN' ? io.reviewingSince(pr) : null;
  const reviewSession = pr?.state === 'OPEN' ? io.reviewSession?.(pr, tree) : null;
  const postFailed = !reviewSession && reviewingSince ? io.reviewPostFailed?.(pr, reviewingSince) === true : false;
  let reviewThreads;
  if (pr?.state === 'OPEN' && io.reviewThreads && (pr.reviews || []).some(review => review.commit?.oid === pr.headRefOid && /<!-- agent-review\b[^>]*\bverdict=fixes\b/.test(review.body || ''))) {
    try { reviewThreads = io.reviewThreads(pr); } catch { reviewThreads = { nodes: [], pageInfo: { hasNextPage: true } }; }
  }
  // Only the assessment of the current phase is read: the issue's before a draft exists, then the PR's.
  const assessment = io.assessment(issue, pr?.state === 'OPEN' ? pr : null);
  const assessments = pr?.state === 'OPEN' ? { prAssessment: assessment } : { issueAssessment: assessment };
  return { issue, pr, tree, blockers, dropped, handBack, diffPaths, ...assessments, reviewingSince, reviewSession, postFailed, reviewThreads, now: io.now?.() ?? Date.now() };
}
// The risk that picks the models: the PR's label once a draft exists, else the issue assessment; never below the floor.
function currentRisk(facts, step) {
  const { issue, pr } = facts;
  if (step.agent === 'planner') return 'R2';
  const floor = riskLabel(issue.labels || []);
  return pr ? maxRisk(riskLabel(pr.labels || []), floor) : maxRisk('R1', floor, facts.issueAssessment?.risk);
}
const briefs = { 'conflict-resolver': conflictResolverBrief, implementer: implementerBrief, reviewer: reviewerBrief, improver: improverBrief, devops: devopsBrief, planner: plannerBrief };
function instruction(io, facts, step, lanes) {
  const { issue, pr, tree } = facts;
  if (!step.agent) return step;
  const risk = currentRisk(facts, step);
  const round = pr ? prState(pr, lanes).round : 0;
  const brief = join(io.scratch(tree), `drive-${issue.number}-${step.agent}.md`);
  let assignment = deliveryAssignment(lanes.delivery, step, risk, round);
  // A resumed session keeps the model it started with, even one the fresh round raised. Only when the risk changed since and the
  // table now names another model does a fresh session start from a handoff brief; the prior brief records the risk and model.
  const started = step.resume && step.agent === 'implementer' ? /\bRisk (R\d)\. Model (\S+?)\. Effort /.exec(io.read?.(brief) || '') : null;
  if (started && started[2] !== assignment.model) {
    if (started[1] === risk) assignment = { ...assignment, model: started[2] };
    else step = { ...step, resume: undefined, handoff: true, reason: `${step.reason || 'fix'}; the risk changed the model from ${started[2]} to ${assignment.model}, so a fresh session continues from a handoff` };
  }
  const { model, effort, host, session } = assignment;
  const packet = step.agent === 'reviewer' && pr ? join(io.scratch(tree), 'review-packet.md') : null;
  const context = { issue, pr, tree, step, risk, model, effort, round, handBack: facts.handBack, packet, base: lanes.base, repo: lanes.repo, diffPaths: facts.diffPaths || [], prAssessment: facts.prAssessment, floor: riskLabel(issue.labels || []) };
  if (packet) writePacket(io, packet, { issue, pr, tree, round, lanes });
  io.write(brief, briefs[step.agent](context));
  const out = { agent: step.agent, host, model, effort, plugin: pluginVersion(), brief, issue: issue.number, pr: pr?.number ?? null, session, mode: step.mode, cwd: tree?.path || null };
  const configured = lanes.delivery?.roles?.[step.agent === 'implementer' && step.fresh ? 'freshImplementer' : step.agent];
  if (Array.isArray(configured)) out.alternatives = configured.slice(1);
  if (step.task) out.task = step.task;
  if (step.reason) out.reason = step.reason;
  if (step.resume) out.resume = true;
  if (step.handoff) out.handoff = true;
  if (host === 'agy') out.command = ['node', fileURLToPath(new URL('../agy-session.mjs', import.meta.url)), lanes.delivery?.executables?.agy || 'agy', step.agent, model, brief];
  // The epic outcome review has no PR to claim: the Reviewer runs in its own session and posts one comment; the wrapper only records its usage on the epic.
  if (step.agent === 'reviewer' && !pr) out.command = ['node', fileURLToPath(new URL('../review-session.mjs', import.meta.url)), '--epic', String(issue.number), ...reviewerCommand(model, brief, `epic-${issue.number}-outcome`, host, lanes.delivery?.executables?.[host] || host, effort)];
  else if (step.agent === 'reviewer') out.command = ['node', fileURLToPath(new URL('../review-session.mjs', import.meta.url)), String(pr.number), pr.headRefOid, ...reviewerCommand(model, brief, `review-${pr.number}-r${step.round}`, host, lanes.delivery?.executables?.[host] || host, effort)];
  return out;
}
// The packet is an aid: when it cannot be built the Reviewer is told to gather the context itself.
function writePacket(io, path, { issue, pr, tree, round, lanes }) {
  let text;
  try { text = reviewPacket(io.packetFacts({ issue, pr, tree, round, lanes })); } catch (error) { text = `# Review packet unavailable\n\nDrive could not build it (${String(error.message).replace(/\s+/g, ' ').slice(0, 200)}); gather the context with \`review-context\`.\n`; }
  io.write(path, text);
}
function finish(step) {
  if (step.wait) return { ...step, command: waitCommandFor(step.wait.pr, step.wait.until) };
  return step;
}
// The session that wrote a hand-back: a `risk:` answer is devops, a planner answers consolidated or distinct, else the implementer.
export const handBackRole = hb => hb.agent || (hb.risk ? 'devops' : ['consolidated', 'distinct', 'sliced', 'narrowed'].includes(hb.status) ? 'planner' : 'implementer');
// Every subagent hand-back records one usage row, `unreported` when it carries no `usage:` line: on its PR once open, else on the issue.
export function driveIssue(io, n, lanes, handBack = {}) {
  const state = { recorded: false };
  const result = driveIssueSteps(io, n, lanes, handBack, state);
  if (!state.recorded && (handBack.status || handBack.risk || handBack.usage)) {
    state.recorded = true;
    try { io.recordUsage?.({ number: n, headRefOid: '' }, handBack); } catch { /* usage is optional */ }
  }
  return result;
}
function driveIssueSteps(io, n, lanes, handBack, state) {
  let bodyUpdated = false;
  // A conflict-resolver that failed the gate (or blocked) hands the merge in progress to the implementer.
  const resolverFailed = handBack.agent === 'conflict-resolver' && (handBack.status !== 'done' || handBack.check === 'fail');
  for (let i = 0; i < 12; i++) {
    const facts = readIssueFacts(io, n, resolverFailed ? {} : handBack);
    // A failure never blocks a step.
    if (!state.recorded && (handBack.status || handBack.risk || handBack.usage) && facts.pr?.state === 'OPEN') {
      state.recorded = true;
      try { io.recordUsage?.(facts.pr, handBack); } catch { /* usage is optional */ }
    }
    if (!bodyUpdated && handBack.status === 'done' && (handBack.note || handBack.body) && facts.pr?.state === 'OPEN' && facts.tree && !facts.tree.dirty && !facts.tree.unpushed) {
      io.updateBody(facts.pr, facts.tree, handBack);
      bodyUpdated = true;
    }
    let step = decideIssue(facts, lanes);
    // A base conflict is merged by drive, never rebased: manifest conflicts take the base's side with no model, other mechanical
    // ones go to a Haiku conflict-resolver, and a resolver that fails the gate leaves the merge to the implementer.
    if (facts.pr?.state === 'OPEN' && facts.tree && io.mergeBase) {
      const marker = join(io.scratch(facts.tree), `drive-${n}-conflict`);
      const resolving = agent('conflict-resolver', 'resolve', { reason: 'mechanical conflicts merging the base into the head' });
      if (facts.tree.merging && resolverFailed) { io.write(marker, 'implementer'); step = { ...agent('implementer', 'fix', { resume: true }), reason: 'the conflict-resolver failed the gate; finish the merge already in progress' }; }
      else if (facts.tree.merging && !handBack.status && io.read(marker) !== 'implementer') return finish(instruction(io, facts, resolving, lanes));
      else if (step.agent === 'implementer' && step.mode === 'fix' && step.resume && /base conflict|conflicts with its base/.test(step.reason || '')) {
        io.write(marker, '');
        const merged = io.mergeBase(facts.tree);
        if (merged.committed) { if (facts.pr.autoMergeRequest) io.disableAutoMerge(facts.pr); io.push(facts.tree); return finish({ wait: { pr: facts.pr.number, until: 'ci' }, reason: 'merged the base into the head' }); }
        if (merged.conflicts.length) return finish(instruction(io, { ...facts, tree: { ...facts.tree, merging: true } }, { ...resolving, conflicts: merged.conflicts }, lanes));
      }
    }
    // A head moved on GitHub (a base merged by `update-branch`) reaches a clean worktree before an agent works in it.
    if (step.agent && facts.tree && facts.pr?.state === 'OPEN' && !facts.tree.dirty && !facts.tree.unpushed) io.syncTree(facts.tree);
    if (!step.do) return finish(instruction(io, facts, step, lanes));
    const { issue, pr, tree } = facts;
    if (step.do === 'start') {
      // Unstarted issues that overlap this one go to the planner first; drive starts nothing until they are consolidated.
      // An issue with an open PR is never merged, so the planner would only hand back `distinct`.
      const overlaps = pr?.state === 'OPEN' ? [] : io.overlaps?.(issue) || [];
      if (overlaps.length) {
        if (['consolidated', 'distinct'].includes(handBack.status)) return { blocked: { issue: n, reason: `the planner handed back ${handBack.status}, yet ${overlaps.map(o => `#${o}`).join(', ')} still overlap${overlaps.length === 1 ? 's' : ''} it` } };
        return finish(instruction(io, facts, agent('planner', 'consolidate', { reason: `${overlaps.map(o => `#${o}`).join(', ')} overlap${overlaps.length === 1 ? 's' : ''} the scope and epic of #${n}`, overlaps }), lanes));
      }
      io.start(issue, pr?.headRefName); io.board(n, 'PROGRESS');
    }
    else if (step.do === 'assess') {
      const floor = riskLabel(issue.labels || []);
      io.assess(issue, pr?.state === 'OPEN' ? pr : null, { risk: maxRisk(floor, step.risk), assessed: step.risk, floor, head: pr?.headRefOid ?? null, paths: pr ? facts.diffPaths : [], reason: step.reason });
    }
    else if (step.do === 'commit') io.commit(tree, handBack.commit, handBack.paths);
    else if (step.do === 'push') { if (pr?.autoMergeRequest) io.disableAutoMerge(pr); io.push(tree); }
    else if (step.do === 'open') { io.open(issue, tree, maxRisk(riskLabel(issue.labels || []), facts.issueAssessment?.risk || 'R1'), handBack); bodyUpdated = true; }
    else if (step.do === 'release-review') io.releaseReview(pr, tree, step.claim);
    else if (step.do === 'link-issue') io.linkIssue(pr, issue);
    else if (step.do === 'risk') io.risk(pr, prState(pr, lanes).risk, step.risk);
    // A draft PR keeps its issue In progress; Review starts when the PR is marked ready. A ready PR also drops the
    // issue's claim, as spec's transition table states; the open PR still excludes reassignment.
    else if (step.do === 'ready') { io.ready(pr, tree); io.board(n, 'REVIEW'); if (stateLabels(issue).length) io.unclaim(issue); }
    else if (step.do === 'unclaim') io.unclaim(issue);
    else if (step.do === 'approve') {
      try { io.approve(pr, step.round); } catch (error) { console.error(`drive: could not post the approval on #${pr.number} (${String(error.message).replace(/\s+/g, ' ').slice(0, 200)}); the Reviewer will`); return finish(instruction(io, facts, agent('reviewer', 'approve', { reason: 'drive could not post the approval', round: step.round }), lanes)); }
    }
    else if (step.do === 'auto-merge') { if (!io.strictPolicy()) return { owner: `${lanes.base} must require configured checks on an up-to-date branch`, url: `https://github.com/${lanes.repo}/settings/rules` }; io.autoMerge(pr, tree); }
    // GitHub reports the merge state late, so drive waits on the new head's CI instead of reading BEHIND again.
    else if (step.do === 'update-branch') { if (pr.autoMergeRequest) io.disableAutoMerge(pr); io.updateBranch(pr); return finish({ wait: { pr: pr.number, until: 'ci' }, reason: 'merged the base into the head' }); }
    else if (step.do === 'close') { io.close(issue); io.board(n, 'DONE'); }
    else if (step.do === 'remove-worktree') { io.removeTree(tree); return { done: { issue: n } }; }
  }
  throw new Error(`drive made no progress on #${n}; run status ${n}`);
}
function unresolvedDelivery(io, slice, base, epic, ancestors = new Set()) {
  if (!slice || slice.state !== 'CLOSED' || ancestors.has(slice.number)) return [slice?.number].filter(Boolean);
  // A slice the planner folded into another stands for it: the target's delivery counts.
  const target = consolidatedInto(slice.body);
  if (target && target !== slice.number && !ancestors.has(target)) return unresolvedDelivery(io, io.issue(target), base, epic, new Set([...ancestors, slice.number]));
  if (!isEpic(slice)) return io.mergedClosingPr(slice.number, base) || io.consolidatedDelivery?.(epic, slice, base) ? [] : [slice.number];
  const seen = new Set([...ancestors, slice.number]);
  try {
    const children = io.subIssues(slice.number);
    if (!children.length) return [slice.number];
    return children.flatMap(child => {
      const issue = io.issue(child.number);
      return issue ? unresolvedDelivery(io, issue, base, epic, seen) : [child.number];
    });
  } catch {
    return [slice.number];
  }
}
export function driveEpic(io, epic, lanes) {
  if (epic.state !== 'OPEN' || (epic.labels || []).some(label => (label.name ?? label) === 'lane:owner')) return decideEpic({ epic, slices: [] });
  const { blockers, dropped } = splitDependencies(io.dependencies(epic));
  if (dropped.length) return { owner: droppedReason(epic.number, dropped), url: epic.url };
  if (blockers.length) return { blocked: { issue: epic.number, by: blockers } };
  const withDependencies = slice => ({ ...slice, ...(slice.state === 'OPEN' ? splitDependencies(io.dependencies(slice)) : { blockers: [], dropped: [] }) });
  const slices = io.subIssues(epic.number).map(slice => withDependencies(io.issue(slice.number)));
  if (!slices.length) return instruction(io, { issue: epic, pr: null, tree: null }, decideEpic({ epic, slices }), lanes);
  const marked = slices.filter(slice => (slice.body || '').includes(refinementMarker));
  // A legacy refinement slice is open and wears a refinement slice's own title (`refine: …`, `Refinement …`), not any title that mentions refining.
  const legacy = slices.filter(slice => slice.state === 'OPEN' && !(slice.body || '').includes(refinementMarker) && (/^refin(e|ement)\b/i.test((slice.title || '').trim()) || (slice.body || '').includes(refinementReview)));
  if (marked.length > 1 || legacy.length) return { owner: `epic #${epic.number}: classify refinement candidates ${[...marked, ...legacy].map(slice => `#${slice.number}`).join(', ')}`, url: epic.url };
  // Criteria no slice covers go to the planner before the refinement is created or built.
  if (uncoveredCriteria(epic, slices).length) return instruction(io, { issue: epic, pr: null, tree: null }, decideEpic({ epic, slices }), lanes);
  const refinement = marked[0] || io.createRefinement(epic);
  if (!marked.length) slices.push(refinement);
  const others = slices.filter(slice => slice !== refinement);
  // A sub-issue closed as consolidated or not planned never blocks the refinement; a consolidated one still owes its target's delivery.
  const notPlanned = slice => slice.state === 'CLOSED' && !consolidatedInto(slice.body) && /^not_?planned$/i.test(slice.stateReason || '');
  const retired = new Set(others.filter(slice => notPlanned(slice) || (slice.state === 'CLOSED' && consolidatedInto(slice.body))).map(slice => slice.number));
  const existing = io.allBlockers(refinement.number);
  for (const slice of others.filter(slice => !retired.has(slice.number))) if (!existing.includes(slice.number)) io.addBlocker(refinement.number, slice.number);
  // A closed slice without a merged closing PR holds only refinement and epic completion, not other open slices.
  const unresolved = others.filter(slice => slice.state !== 'OPEN' && !notPlanned(slice)).flatMap(slice => unresolvedDelivery(io, slice, lanes.base, epic.number));
  const unresolvedOwner = unresolved.length ? { owner: `epic #${epic.number}: missing closing PR merged into ${lanes.base} for ${[...new Set(unresolved)].map(number => `#${number}`).join(', ')}`, url: epic.url } : null;
  // Read the refinement's links again after the repair; every open slice blocks it even before GitHub shows a new link.
  const repaired = splitDependencies(io.dependencies(refinement));
  refinement.blockers = [...new Set([...repaired.blockers, ...others.filter(slice => slice.state === 'OPEN').map(slice => slice.number)])];
  refinement.dropped = repaired.dropped.filter(number => !retired.has(number));
  if (refinement.state !== 'OPEN' && unresolvedDelivery(io, refinement, lanes.base, epic.number).length) return { owner: `epic #${epic.number}: missing closing PR merged into ${lanes.base} for #${refinement.number}`, url: epic.url };
  const step = decideEpic({ epic, slices });
  if (unresolvedOwner && (step.do === 'close-epic' || step.slices?.includes(refinement.number))) return unresolvedOwner;
  if (step.do === 'close-epic' && !io.hasLessons(epic.number)) return instruction(io, { issue: epic, pr: null, tree: null }, agent('improver', 'improve'), lanes);
  if (step.do === 'close-epic' || slices.some(slice => (slice.body || '').includes(`<!-- workflow:epic-follow-up ${epic.number} `))) {
    try {
      const read = () => {
        const current = io.issue(epic.number);
        const children = io.subIssues(epic.number).map(child => io.issue(child.number));
        if (current.state !== 'OPEN' || (current.labels || []).some(label => (label.name ?? label) === 'lane:owner')) throw new Error('Epic state or approval changed');
        const dependencies = splitDependencies(io.dependencies(current));
        if (dependencies.blockers.length || dependencies.dropped.length || !io.hasLessons(current.number)) throw new Error('Epic dependencies or lessons changed');
        const delivery = [];
        const deliveryIo = {
          issue: n => { const issue = io.issue(n); delivery.push(['issue', n, issue]); return issue; },
          subIssues: n => { const subIssues = io.subIssues(n); delivery.push(['children', n, subIssues]); return subIssues; },
          mergedClosingPr: (n, base) => { const merged = io.mergedClosingPr(n, base); delivery.push(['merged', n, merged]); return merged; },
          consolidatedDelivery: (epic, child, base) => { const verified = io.consolidatedDelivery?.(epic, child, base) || false; delivery.push(['consolidated', child.number, verified]); return verified; }
        };
        const merged = (n, base) => unresolvedDelivery(deliveryIo, children.find(child => child.number === n), base, current.number).length === 0;
        const result = io.verifyEpic(current, children, lanes.base, merged);
        return { current, children, delivery, result };
      };
      // Drive owns the criterion markers: it adds a missing ID before the Reviewer judges, and ticks a `met` one before closing.
      if (step.do === 'close-epic') {
        const current = io.issue(epic.number);
        if (current.state === 'OPEN' && !(current.labels || []).some(label => (label.name ?? label) === 'lane:owner')) {
          const withIds = addCriterionIds(current.body);
          if (withIds !== current.body) io.editEpicBody(current, withIds);
        }
      }
      let first = read();
      if (step.do === 'close-epic' && first.result.unchecked?.length) {
        io.editEpicBody(first.current, tickCriteria(first.current.body, first.result.unchecked));
        first = read();
      }
      if (!first.result.complete) {
        const outstanding = first.result.outstanding || [];
        // No current outcome comment: the per-criterion evidence is the Reviewer's to post, not the owner's.
        if (first.result.needsReview && !outstanding.length && step.do === 'close-epic') return finish(instruction(io, { issue: epic, pr: null, tree: null }, agent('reviewer', 'epic-outcome', { reason: first.result.issues.join('; ') }), lanes));
        if (outstanding.length) {
          const matches = outstanding.map(criterion => ({ criterion, found: first.children.filter(child => (child.body || '').includes(`<!-- workflow:epic-follow-up ${epic.number} ${criterion.id} -->`)) }));
          // One open follow-up is reused; a new one is created only when every closed match was delivered by a merged PR (not closed as not planned). Several open ones, or an undelivered closed one, need the owner.
          for (const item of matches) {
            const open = item.found.filter(child => child.state === 'OPEN');
            if (open.length > 1) throw new Error(`Duplicate follow-ups ${open.map(child => `#${child.number}`).join(', ')} for criterion ${item.criterion.id} need classification`);
            const undelivered = item.found.filter(child => child.state !== 'OPEN' && (/^not_?planned$/i.test(child.stateReason || '') || unresolvedDelivery(io, child, lanes.base, epic.number).length));
            if (!open.length && undelivered.length) throw new Error(`Closed follow-up ${undelivered.map(child => `#${child.number}`).join(', ')} for criterion ${item.criterion.id} has no merged closing PR; classify it`);
            item.open = open[0];
          }
          io.uncheckEpicCriteria(first.current, outstanding.map(item => item.id));
          const updated = io.issue(epic.number);
          if (outstanding.some(item => !(updated.body || '').split('\n').some(line => /^\s*[-*] \[ \] /.test(line) && line.includes(`${item.text} <!-- workflow:criterion ${item.id} -->`)))) throw new Error('Criterion was not left unchecked');
          io.requiredBoard(epic.number, 'BLOCKED');
          for (const item of matches) {
            const followUp = item.open || io.createEpicFollowUp(first.current, item.criterion);
            const linked = io.subIssues(epic.number).some(child => child.number === followUp.number);
            if (!linked || followUp.state !== 'OPEN' || !(followUp.body || '').includes(item.criterion.nextAction)) throw new Error('Follow-up is not linked, open and actionable');
            io.requiredBoard(followUp.number, 'TODO');
          }
        }
        if (step.do === 'close-epic' || !outstanding.length) return { owner: `epic #${epic.number}: ${first.result.issues.join('; ')}; update the epic outcome review and evidence for outstanding work`, url: epic.url };
      }
      if (step.do === 'close-epic') {
        const second = read();
        if (!second.result.complete || JSON.stringify(first) !== JSON.stringify(second)) return { owner: `epic #${epic.number}: evidence or issue state changed before closure`, url: epic.url };
        io.closeEpic(second.current);
        return { done: { epic: epic.number } };
      }
    } catch (error) { return { owner: `epic #${epic.number}: closure verification failed: ${error.message}`, url: epic.url }; }
  }
  if (!step.slices) return finish(instruction(io, { issue: epic, pr: null, tree: null }, step, lanes));
  const entries = step.slices.map(number => { const facts = readIssueFacts(io, number, {}); return { number, pr: facts.pr, step: decideIssue(facts, lanes) }; });
  const chosen = pickSlice(holdBaseUpdates(entries));
  const result = driveIssue(io, chosen.number, lanes);
  const alsoReady = step.slices.filter(number => number !== chosen.number);
  return { ...result, epic: epic.number, ...(alsoReady.length ? { alsoReady } : {}) };
}
// An owner step is also recorded where the owner will see it, on the issue or epic that drive was asked to drive.
// Drive repeats an unchanged step silently; a failure never changes the step.
export function drive(io, n, lanes, handBack = {}) {
  const result = driveTarget(io, n, lanes, handBack);
  if (result.owner) {
    try { io.notifyOwner?.(n, result); } catch (error) { console.error(`drive: could not record the owner step on #${n}: ${String(error.message).replace(/\s+/g, ' ').slice(0, 200)}`); }
    if (result.alsoReady?.length) return { ...result, continue: `report the owner step, then drive each alsoReady slice alone (${result.alsoReady.map(m => `#${m}`).join(', ')}); the owner step holds only one slice` };
  }
  return result;
}
function driveTarget(io, n, lanes, handBack = {}) {
  const issue = io.issue(n);
  // An epic advances from GitHub state alone: the planner's hand-back changes nothing drive reads.
  if (isEpic(issue)) {
    // A hand-back for an epic records one usage row on the epic (improver unless it names its agent); a failure never blocks.
    if (handBack.status || handBack.risk || handBack.usage) {
      try { io.recordUsage?.({ number: n, headRefOid: '' }, { ...handBack, agent: handBack.agent || 'improver' }); } catch { /* usage is optional */ }
    }
    return driveEpic(io, issue, lanes);
  }
  if (handBack.status !== 'consolidated') return driveIssue(io, n, lanes, handBack);
  // The planner merged overlapping issues: drive checks the claim on GitHub, reports it and carries on with the canonical issue.
  const report = consolidationReport(handBack);
  const open = report.closed.filter(closed => io.issue(closed)?.state !== 'CLOSED');
  const canonical = report.into === null ? null : io.issue(report.into);
  if (!report.closed.length || open.length || (report.into !== null && canonical?.state !== 'OPEN')) return { blocked: { issue: n, reason: `the planner reported a consolidation into ${report.into === null ? 'no issue' : `#${report.into}`}, but ${open.length ? `${open.map(o => `#${o}`).join(', ')} stay open` : 'the canonical issue is not open or no closed issue was named'}` } };
  const target = issue.state === 'OPEN' ? n : report.into ?? n;
  return { ...driveIssue(io, target, lanes, target === n ? handBack : {}), consolidated: report };
}
// --next: ready items in order, started issues first, then approved epics and standalone issues by number.
// An item with an unmet or dropped dependency never qualifies; `depsOf` reads them lazily, in that order.
export function* nextTargets(issues, depsOf = () => ({ blockers: [], dropped: [] })) {
  const names = issue => issue.labels.map(label => label.name ?? label);
  const candidates = issues.filter(issue => !names(issue).includes('lane:owner'));
  const rank = issue => Number(!names(issue).includes('state:started'));
  const ordered = [...candidates].sort((a, b) => rank(a) - rank(b) || a.number - b.number);
  for (const issue of ordered) { const { blockers, dropped } = depsOf(issue); if (!blockers.length && !dropped.length) yield issue.number; }
}
export const nextTarget = (issues, depsOf) => nextTargets(issues, depsOf).next().value ?? null;

// A PR waiting on CI or its merge lets the next ready issue run; a later approved PR never merges before an earlier one.
const overlaps = (step, earlierWaiting) => (step.wait && ['ci', 'merged'].includes(step.wait.until)) || (earlierWaiting && step.do === 'auto-merge');
export function driveNext(io, numbers, lanes, handBack = {}) {
  const waiting = [];
  let chosen = null; let first = null;
  for (const number of numbers) {
    const index = first === null ? 0 : 1;
    if (first === null) first = number;
    const item = io.issue(number);
    if (isEpic(item)) { chosen = number; break; }
    const step = decideIssue(readIssueFacts(io, number, index === 0 ? handBack : {}), lanes);
    if (overlaps(step, waiting.length)) { if (step.wait) waiting.push({ issue: number, step }); continue; }
    chosen = number; break;
  }
  if (first === null) return { done: { reason: 'no started issue, approved epic or standalone issue is ready' } };
  if (chosen === null) chosen = first;
  const result = drive(io, chosen, lanes, chosen === first ? handBack : {});
  const also = waiting.filter(entry => entry.issue !== chosen).map(entry => ({ issue: entry.issue, ...finish(entry.step) }));
  return also.length ? { ...result, alsoWaiting: also } : result;
}

// One drive session per target. The claim belongs to the session, not to one CLI call: every `drive` call refreshes its
// heartbeat, and the session releases it when drive returns `done`, `owner` or `blocked`. A claim another session holds
// blocks it until the heartbeat is older than `staleMs` or it has made no progress (an unchanged answer) for `progressMs`; then that session is idle, orphaned or gone and the next one takes over.
// Without an id in the environment, the session is the nearest ancestor that is no shell: each Bash call of one agent
// session is a fresh shell under the same long-lived agent process, so its pid and start time stay stable across calls.
const shells = /^(-?(sh|bash|zsh|dash|fish|ksh|tcsh|csh)|env|sudo|script|login)$/;
function processInfo(pid) {
  const out = spawnSync('ps', ['-o', 'ppid=,lstart=,comm=', '-p', String(pid)], { encoding: 'utf8' });
  const match = out.status === 0 && out.stdout.trim().match(/^(\d+)\s+(.{24})\s+(.+)$/);
  return match ? { ppid: Number(match[1]), started: match[2].trim(), name: match[3].trim().split('/').pop() } : null;
}
export function driveSessionId(env = process.env, info = processInfo) {
  const set = env.WORKFLOW_DRIVE_SESSION || env.CLAUDE_SESSION_ID || env.CODEX_SESSION_ID;
  if (set) return set;
  let pid = process.ppid;
  for (let depth = 0; pid > 1 && depth < 16; depth++) {
    const here = info(pid);
    if (!here) break;
    if (!shells.test(here.name)) return `proc-${pid}-${here.started.replace(/\s+/g, '_')}`;
    pid = here.ppid;
  }
  return `ppid-${process.ppid}`;
}
export function acquireRunLock({ directory, key, session, now = Date.now(), staleMs = 30 * 60_000, progressMs = 10 * 60_000 }) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
  let held = null;
  try { held = JSON.parse(readFileSync(path, 'utf8')); } catch { /* none or unreadable: free */ }
  const other = held && held.session !== session;
  // A heartbeat alone keeps nothing: the holder must also have made drive progress (its answer changed) within `progressMs`.
  const progressAt = held?.progressAt ?? held?.at ?? now;
  // Only a holder that called drive again and got the same answer (held.at > progressAt) is orphaned early; a silent one may have an agent working, so it keeps `staleMs`.
  const orphaned = held?.at > progressAt && now - progressAt >= progressMs;
  if (other && now - held.at < staleMs && !orphaned) return { acquired: false, by: held, takeOverAt: progressAt + progressMs };
  const mine = !other && held;
  const state = { session, at: now, progressAt: mine ? progressAt : now, fingerprint: mine ? held.fingerprint : undefined };
  writeFileSync(path, JSON.stringify(state));
  const read = () => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
  return {
    acquired: true,
    tookOver: other ? held : null,
    // Records what drive answered; a changed answer is progress. False when another session took the claim meanwhile.
    record: (fingerprint, at = now) => {
      const current = read();
      if (!current || current.session !== session) return false;
      writeFileSync(path, JSON.stringify({ ...current, fingerprint, progressAt: current.fingerprint === fingerprint ? current.progressAt : at }));
      return true;
    },
    release: () => { try { if (JSON.parse(readFileSync(path, 'utf8')).session === session) rmSync(path); } catch { /* already gone */ } },
  };
}
// Up to six runs per repository: one claim file per issue, so a seventh waits until a claim is released or goes stale.
export const maxRuns = 6;
const claimKey = key => `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
export function liveRuns({ directory, repo, now = Date.now(), except = null, staleMs = 30 * 60_000 }) {
  const prefix = claimKey(repo).slice(0, -5) + '-';
  let files = [];
  try { files = readdirSync(directory); } catch { /* no claims yet */ }
  return files.filter(file => file.startsWith(prefix) && /^\d+\.json$/.test(file.slice(prefix.length)) && file !== except).filter(file => {
    try { return now - JSON.parse(readFileSync(join(directory, file), 'utf8')).at < staleMs; } catch { return false; }
  }).length;
}
const runDirectory = () => join(homedir(), '.cache', 'workflow-cli', 'drive-runs');
export function waitSlotCommand(args, lanes, { directory = runDirectory(), pause = seconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000), now = Date.now } = {}) {
  const deadline = now() + 120 * 60_000;
  for (;;) {
    if (liveRuns({ directory, repo: lanes.repo, now: now() }) < maxRuns) return 0;
    if (now() >= deadline) { console.error(`workflow: timed out waiting for a free drive slot in ${lanes.repo}`); return 1; }
    pause(30);
  }
}
const slotsFull = (issue, lanes) => ({ wait: { until: 'slot', repo: lanes.repo }, reason: `${lanes.repo} already runs ${maxRuns} drive sessions${issue ? `; #${issue} starts when one finishes` : ''}`, command: ['node', cli, 'wait', 'slot'] });
const blockedClaim = (issue, lock, now) => {
  const when = lock.takeOverAt > now ? `it may be taken over after ${new Date(lock.takeOverAt).toISOString()} if it makes no progress` : 'it may be taken over on the next call';
  return { blocked: { ...(issue ? { issue } : {}), reason: `another drive session (${lock.by.session}) is live on ${issue ? `#${issue}` : '--next'} and is making progress; it never races, so run drive again later: ${when}` } };
};
const lostClaim = issue => ({ blocked: { ...(issue ? { issue } : {}), reason: 'another drive session took over this claim; this session stops without pushing or posting' } });
const fingerprintOf = result => JSON.stringify(result);
export function driveCommand(args, lanes, io = githubIo(lanes), { lockDirectory = join(homedir(), '.cache', 'workflow-cli', 'drive-runs'), session = driveSessionId(), now = Date.now(), notice = versionNotice(pluginVersion()) } = {}) {
  const usage = 'Usage: drive NUMBER [--hand-back FILE|-] | drive --next';
  let handBack = {};
  const at = args.indexOf('--hand-back');
  if (at >= 0) {
    if (!args[at + 1]) throw new Error(usage);
    handBack = parseHandBack(args[at + 1] === '-' ? readFileSync(0, 'utf8') : readFileSync(args[at + 1], 'utf8'));
    args = args.filter((_, index) => index !== at && index !== at + 1);
  }
  if (args.length !== 1) throw new Error(usage);
  let n;
  if (args[0] === '--next') {
    const numbers = nextTargets(io.openIssues(), issue => splitDependencies(io.dependencies(issue)));
    if (liveRuns({ directory: lockDirectory, repo: lanes.repo, now }) >= maxRuns) { console.log(JSON.stringify(slotsFull(null, lanes))); return; }
    const lock = acquireRunLock({ directory: lockDirectory, key: `${lanes.repo}-next`, session, now });
    if (!lock.acquired) { console.log(JSON.stringify(blockedClaim(null, lock, now))); return; }
    if (lock.tookOver) io.noteTakeover?.(null, lock.tookOver, now);
    const result = driveNext(io, numbers, lanes, handBack);
    if (!lock.record(fingerprintOf(result), now)) { console.log(JSON.stringify(lostClaim(null))); return; }
    if (notice) console.error(notice);
    if (result.done || result.owner || result.blocked) lock.release();
    console.log(JSON.stringify(withConfigCommit(result, lanes)));
    return;
  } else if (/^[1-9]\d*$/.test(args[0])) n = Number(args[0]);
  else throw new Error(usage);
  const own = claimKey(`${lanes.repo}-${n}`);
  let mine = false;
  try { mine = JSON.parse(readFileSync(join(lockDirectory, own), 'utf8')).session === session; } catch { /* no claim */ }
  if (!mine && liveRuns({ directory: lockDirectory, repo: lanes.repo, now, except: own }) >= maxRuns && !existsSync(join(lockDirectory, own))) { console.log(JSON.stringify(slotsFull(n, lanes))); return; }
  const lock = acquireRunLock({ directory: lockDirectory, key: `${lanes.repo}-${n}`, session, now });
  if (!lock.acquired) { console.log(JSON.stringify(blockedClaim(n, lock, now))); return; }
  if (lock.tookOver) io.noteTakeover?.(n, lock.tookOver, now);
  const result = drive(io, n, lanes, handBack);
  if (!lock.record(fingerprintOf(result), now)) { console.log(JSON.stringify(lostClaim(n))); return; }
  if (notice) console.error(notice);
  if (result.done || result.owner || result.blocked) lock.release();
  console.log(JSON.stringify(withConfigCommit(result, lanes)));
}
const withConfigCommit = (result, lanes) => (lanes.configCommit ? { ...result, configCommit: lanes.configCommit } : result);

// ---- check: the project gate under a machine-wide lock with two slots, so at most 2 run at once.

export const checkSlots = ['check-1', 'check-2'];
export const checkLockDirectory = () => join(homedir(), '.cache', 'workflow-cli', 'locks');
function probeSlot(directory, name) {
  const path = join(directory, `${name}.lock`);
  writeFileSync(path, '', { flag: 'a' });
  const probe = process.platform === 'darwin' ? spawnSync('lockf', ['-t', '0', path, 'true'], { stdio: 'ignore' }) : spawnSync('flock', ['-n', path, 'true'], { stdio: 'ignore' });
  return !probe.error && probe.status === 0;
}
export function chooseSlot(isFree, pid = process.pid) {
  return checkSlots.find(isFree) ?? checkSlots[pid % checkSlots.length];
}
export function checkCommand(args, lanes, { root = git('rev-parse', '--show-toplevel'), directory = checkLockDirectory(), probe = probeSlot, runner = runWithLocks } = {}) {
  if (args.length !== 2 || args[0] !== '--worktree') throw new Error('Usage: check --worktree PATH');
  if (args.length && realpathSync(args[1]) !== realpathSync(root)) throw new Error('Check must run from the intended worktree');
  const test = lanes.steps?.test;
  if (!Array.isArray(test) || !test.length) throw new Error('Configure steps.test in .agents/config.json as a non-empty argv array');
  mkdirSync(directory, { recursive: true });
  const slot = chooseSlot(name => probe(directory, name));
  const result = runner(directory, [slot], test[0], test.slice(1), { timeoutSeconds: 3600, cwd: realpathSync(root) });
  if (result.status === lockTimeoutStatus) console.error('workflow: check waited an hour for a free gate slot');
  // The Reviewer's packet reads this record; a write failure never changes the gate's exit code.
  try { writeFileSync(join(workflowScratch(realpathSync(root)), 'gate.json'), JSON.stringify({ status: result.status ?? 1, head: gitIn(realpathSync(root), ['rev-parse', 'HEAD']), at: new Date().toISOString() })); } catch { /* optional record */ }
  return result.status ?? 1;
}
