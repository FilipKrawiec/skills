import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockTimeoutStatus, runWithLocks } from '../locks.mjs';
import { boardStatus, prRecord } from './board.mjs';
import { cachedGithubMetadata, cleanEnvironment, ensureWorkflowLabels, git, jsonCommand, run, workflowScratch } from './core.mjs';
import { droppedReason, findCycle, readDependencies, splitDependencies } from './dependencies.mjs';
import { prFields } from './pr.mjs';
import { prState } from './state.mjs';
import { busyPaths, parseWorktreeList, removeWorktree, worktreeFacts } from './worktrees.mjs';

const cli = fileURLToPath(new URL('../workflow.mjs', import.meta.url));
const riskGuide = fileURLToPath(new URL('../../skills/review/references/risk.md', import.meta.url));
const risks = ['R0', 'R1', 'R2'];
export const maxRisk = (...values) => risks[Math.max(...values.filter(Boolean).map(value => risks.indexOf(value)), 0)];
// Models follow risk for both the implementer and the Reviewer: Opus only for R2.
export const modelFor = risk => (risk === 'R2' ? 'opus' : 'sonnet');
// From the third blocking verdict on, narrow fixes have stopped converging: one fresh implementer on the strongest model
// takes the whole open set. A blocking verdict after that fresh round cuts scope through the planner (`spec`), who narrows
// the issue to what the PR delivers, never a further fix round. The rounds never hand an unapproved PR to the owner.
export const freshFixRound = 3;
// The risk assessor runs on Sonnet whatever the risk.
export const modelForStep = (step, risk) => (step.agent === 'devops' ? 'sonnet' : step.agent === 'planner' || step.fresh ? 'opus' : modelFor(risk));
// Missing configuration retains the existing Claude delivery behavior for migration.
export function deliveryAssignment(delivery, step, risk) {
  if (delivery == null) return { host: 'claude', model: modelForStep(step, risk), session: step.agent === 'reviewer' ? 'separate' : 'subagent' };
  if (!delivery || typeof delivery !== 'object' || !['codex', 'claude'].includes(delivery.orchestrator)) throw new Error('Unsupported delivery orchestrator; configure codex or claude after verifying host capabilities');
  if (delivery.executables != null && (typeof delivery.executables !== 'object' || Array.isArray(delivery.executables) || Object.entries(delivery.executables).some(([host, path]) => !['codex', 'claude'].includes(host) || typeof path !== 'string' || !path.trim()))) throw new Error('Configure delivery.executables as host-to-executable paths');
  const roleName = step.agent === 'implementer' && step.fresh ? 'freshImplementer' : step.agent;
  const role = delivery.roles?.[roleName];
  if (!role || !['codex', 'claude'].includes(role.host) || typeof role.model !== 'string' || !role.model.trim()) throw new Error(`Configure delivery.roles.${roleName} with a supported host and model`);
  if (step.agent !== 'reviewer' && role.host !== delivery.orchestrator) throw new Error(`Unsupported cross-host subagent for ${step.agent}; use the orchestrator host`);
  return { host: role.host, model: role.model, session: step.agent === 'reviewer' ? 'separate' : 'subagent' };
}
const riskLabel = labels => labels.map(label => label.name ?? label).find(name => /^risk:R\d$/.test(name))?.slice(5) || null;
// An epic's final refinement slice: drive finds it by the marker and creates it with the criteria `plan` gives the planner.
const refinementMarker = '<!-- workflow:epic-refinement -->';
const refinementReview = 'Review the merged whole epic against its Outcome, Decisions and architecture rules';
const refinementCriteria = [
  `${refinementReview}. Fix findings in the refinement PR or name them there with reasons. Resolve recorded Nits, aliases, shims and naming clashes, or raise them on owner paths.`,
  'Remove dead files, exports, symbols, fixtures and baseline entries left by the epic. Use project configuration for unused-code tooling; baselines shrink, with no new entries. Make no new feature or behavior change; keep the gate green.',
  'Use project configuration to record before and after times per project gate and CI part; make only measured wins. If a timing source is unavailable or unconfigured, record missing evidence and claim no measured win.',
];

// A risk assessment is one comment drive posts on the issue (before the build) or the PR (each assessed diff): a marker with
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
// Whether the risk assessor must run now: before the build with no issue assessment, on a draft with no assessment of its
// diff, or when the head touches files the last assessment did not see. A `risk:` hand-back answers a due assessment.
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

// A hand-back is at most 5 `key: value` lines; a bare first word is the status.
export function parseHandBack(text) {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 5);
  const result = {};
  lines.forEach((line, index) => {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (match) result[match[1].toLowerCase()] = match[2];
    else if (index === 0) result.status = line.split(/\s+/)[0];
  });
  if (result.status) result.status = result.status.toLowerCase();
  if (result.paths) result.paths = result.paths.split(/[\s,]+/).filter(Boolean);
  return result;
}

// A Reviewer claim older than this with no review posted since is stale: its session never started or died.
export const staleReviewMinutes = 60;
// Whether `state:reviewing`, labelled at `since` (ms), is stale at `now`: old enough and no Reviewer review after it.
export function staleReviewClaim(pr, lanes, since, now) {
  if (!since || now - since < staleReviewMinutes * 60_000) return false;
  const reviewer = lanes.reviewer?.toLowerCase();
  return !(pr.reviews || []).some(review => review.author?.login?.toLowerCase() === reviewer && Date.parse(review.submittedAt || '') > since);
}

const agent = (agentName, mode, extra = {}) => ({ agent: agentName, mode, ...extra });
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
  if (hb.status === 'replan') return agent('planner', 'replan', { reason: hb.note || 'the implementer asked to replan' });
  if (hb.status === 'blocked') return { owner: `#${issue.number}: ${hb.note || 'the implementer is blocked'}` };
  // A planner split makes the issue an epic, which `drive` routes to `driveEpic`; still a story, the split did not happen,
  // and dispatching the planner again would loop on the same blocking verdict. A narrowed issue is handled with its PR.
  if (hb.status === 'sliced') return { blocked: { issue: issue.number, reason: 'the planner handed back sliced, yet the issue is not an epic' } };
  const claimed = (issue.labels || []).some(label => (label.name ?? label) === 'state:started');
  if (!pr || pr.state !== 'OPEN') {
    if (!claimed || !tree) return assessmentStep(facts) || { do: 'start' };
    if (hb.status !== 'done') return agent('implementer', 'build');
    if (tree.dirty) return hb.commit && hb.paths?.length ? { do: 'commit' } : agent('implementer', 'build', { reason: 'uncommitted changes and no commit/paths in the hand-back' });
    if (!tree.commits) return agent('implementer', 'build', { reason: 'no commits ahead of the base' });
    return tree.unpushed ? { do: 'push' } : { do: 'open' };
  }
  const state = prState(pr, lanes);
  if (tree && (tree.dirty || tree.unpushed)) {
    if (hb.status !== 'done') return agent('implementer', 'fix', { reason: 'fix in progress' });
    if (tree.dirty) return hb.commit && hb.paths?.length ? { do: 'commit' } : agent('implementer', 'fix', { reason: 'uncommitted changes and no commit/paths in the hand-back' });
    return { do: 'push' };
  }
  if (state.labels.includes('state:reviewing')) return staleReviewClaim(pr, lanes, facts.reviewingSince, facts.now ?? Date.now()) ? { do: 'release-review' } : { wait: { pr: pr.number, until: 'reviewed' } };
  const assess = assessmentStep(facts);
  if (assess) return assess;
  // The owner's issue label is a floor; drive raises a PR label to it and never lowers one someone raised.
  const risk = maxRisk(state.risk, riskLabel(issue.labels || []), facts.prAssessment?.risk);
  if (risks.indexOf(risk) > risks.indexOf(state.risk)) return { do: 'risk', risk };
  const next = state.next;
  // A narrowed issue changes what the head is judged against: the Reviewer judges the same head again, no new build.
  if (hb.status === 'narrowed' && state.verdict === 'fixes') return agent('reviewer', 'review', { reason: 'the planner narrowed the issue to what the PR delivers', narrowed: true, round: state.round + 1 });
  if (next.action === 'fix') {
    if (!tree) return { do: 'start' };
    if (state.verdict === 'fixes' && state.round > freshFixRound) return agent('planner', 'replan', { reason: `round ${state.round}: the fresh fix round left blocking findings; narrow the issue to what the PR delivers` });
    const fresh = state.verdict === 'fixes' && state.round === freshFixRound;
    return agent('implementer', 'fix', fresh ? { reason: `round ${state.round}: the whole open set, fresh`, fresh: true } : { reason: next.reason, resume: true });
  }
  if (next.action === 'wait-ci') return { wait: { pr: pr.number, until: 'ci' } };
  // An unapproved `ready` verdict on a ready PR asks only for the approval; anything else is a review round.
  if (next.action === 'review') {
    const approve = !pr.isDraft && state.verdict === 'ready';
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
export function decideEpic({ epic, slices }) {
  if (epic.state !== 'OPEN') return { done: { epic: epic.number } };
  if ((epic.labels || []).some(label => (label.name ?? label) === 'lane:owner')) return { owner: `epic #${epic.number} waits for the owner's approval`, url: epic.url };
  if (!slices.length) return agent('planner', 'slice', { reason: 'the epic has no slices' });
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

export function implementerBrief(f) {
  const fix = f.step.mode === 'fix';
  return `# Implementer brief: #${f.issue.number} ${f.issue.title}

Mode: ${f.step.mode}${f.step.reason ? ` (${f.step.reason})` : ''}. Risk ${f.risk}. Model ${f.model || modelForStep(f.step, f.risk)}.
Issue: ${f.issue.url}
Worktree: ${f.tree.path} (branch ${f.tree.branch}, base origin/${f.base})
PR: ${f.pr ? `${f.pr.url} at ${f.pr.headRefOid}, round ${f.round}` : 'none yet; drive opens it'}

## Task

${!fix ? 'Deliver the issue below so every acceptance criterion holds, with focused tests.' : f.step.fresh ? 'Earlier fix rounds did not converge. Read every open Blocker and Important thread `review-context` lists and the issue\'s criteria, find their shared cause and fix it whole, with the neighbouring cases the same cause breaks, each with a focused test. Fix nothing outside the criteria; Nits never block.' : 'Fix the failing check or the Blocker and Important findings of the newest review; `review-context` lists the open threads. Fix nothing else; Nits never block.'} Work only in the worktree. Run one plain command per Bash call.

## Commands you may run

- \`node ${cli} check\`: the project gate, under the machine-wide lock. It must pass before you hand back \`done\`.
- \`node ${cli} commit --message "<Conventional Commit subject>" -- <paths>\`
${fix ? `- \`node ${cli} status ${f.pr.number}\` and \`node ${cli} review-context --pr ${f.pr.number}\`\n` : ''}
Never push, open, label, ready or merge a PR, and never start an agent: drive does that.

## Hand-back, at most 5 lines

\`\`\`text
status: done | replan | blocked
commit: <Conventional Commit subject, only if you left changes uncommitted>
paths: <paths drive commits, only with commit>
check: pass | fail
note: <one line: what changed, or why replan or blocked>
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
${f.pr ? `PR: ${f.pr.url}. Read the diff with \`gh pr diff ${f.pr.number} --repo ${f.repo}\`; it changes ${f.diffPaths.length} files: ${f.diffPaths.join(', ') || 'none listed'}.` : 'Read the issue below, its scope packet and the code it names.'}
${last ? `The last assessment set ${last.risk} at ${String(last.head || '').slice(0, 7)}: ${last.reason}` : ''}
${f.floor ? `The issue's owner-set \`risk:${f.floor}\` is a floor drive applies after you; assess the change on its own.` : ''}

Read code, CODEOWNERS and the repository's rules as evidence; never edit, commit or push, never label or comment, never start an agent and never print a token. Drive sets the label and posts your reason.

## Hand-back, exactly 2 lines

\`\`\`text
risk: R0 | R1 | R2
reason: <one line: what the change does and why that risk>
\`\`\`

## Issue

${f.issue.body || '(no body)'}
`;
}
function improverBrief(f) {
  return `# Improvement brief: epic #${f.issue.number} ${f.issue.title}

Invoke the \`improve\` skill for process lessons from the delivered epic ${f.issue.url}. Follow its idempotency and recording steps; the refinement PR has merged. Return its output in at most 5 lines.
`;
}
export function reviewerBrief(f) {
  return `# Reviewer brief: PR #${f.pr.number} for #${f.issue.number}

Task: ${f.step.mode === 'approve' ? 'approve a ready PR whose newest verdict at its head is `ready` (review skill, references/approval.md)' : 'review the draft at its head (review skill, steps 1 to 5)'}.
PR: ${f.pr.url} at head ${f.pr.headRefOid}; round ${f.step.round}; risk ${f.risk}. Issue: ${f.issue.url}
${f.step.narrowed ? 'Narrowed scope, same head: the planner narrowed the issue to what this head delivers. Re-judge each of your open blocking threads against the issue as it now reads, pass each one outside it as `--resolve-thread`, and post a new verdict.\n' : f.step.round > 1 ? 'Later round: judge only the delta `review-context` returns as `comparison`.\n' : ''}
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

Task: ${f.step.mode === 'slice' ? 'slice this approved epic into sub-issues, each deliverable alone, with blocked-by links between dependent slices. Invoke the `plan` skill to create the final refinement slice' : f.pr ? `${f.step.reason}; narrow this issue's criteria to what PR #${f.pr.number} delivers at its head, and move the unmet criteria to a new issue under the same epic, blocked by this one. Hand back \`narrowed\`: the Reviewer then judges the same head against the narrowed criteria and the PR merges closing this issue. Never close the PR` : `${f.step.reason}; split the issue at its logical seam into an epic with one-PR sub-issues (spec's split.md: set \`type:epic\` first) and hand back \`sliced\``}. Invoke the \`spec\` skill for the issue form.
Issue: ${f.issue.url}
Commands: \`node ${cli} issue create ...\`, \`node ${cli} issue edit ...\`, \`gh api\` to link sub-issues and blocked-by dependencies.
Never write code and never start an agent. Agree each slice with the owner.

## Hand-back, at most 5 lines

status: sliced | narrowed | blocked
slices: <issue numbers, or the new issue when narrowed>
note: <one line>

## Issue

${f.issue.body || '(no body)'}
`;
}
// The Reviewer runs as a separate non-interactive session, so the session that wrote the PR never approves it.
export function reviewerCommand(model, brief, name, host = 'claude', executable = host) {
  if (host === 'codex') return [executable, 'exec', '-m', model, `Read ${fileURLToPath(new URL('../../skills/review/SKILL.md', import.meta.url))}, then follow your brief at ${brief}. Return at most 5 lines.`];
  if (host !== 'claude') throw new Error('Unsupported reviewer host');
  return [executable, '--print', '--agent', 'filipkrawiec-workflow:reviewer', '--model', model, '--permission-mode', 'auto', '--name', name, `Follow your brief at ${brief}. Return at most 5 lines.`];
}
export const waitCommandFor = (pr, until) => ['node', cli, 'wait', String(pr), '--until', until];

export function prBody(issue, risk, hb, subjects) {
  return `Closes #${issue.number}

## Problem

${issue.title} (#${issue.number}).

## Change

${hb.note || subjects.map(subject => `- ${subject}`).join('\n') || 'See the commits.'}

## Verification

The implementer ran the project gate with \`workflow.mjs check\`: ${hb.check || 'unreported'}.

Risk ${risk}, from the risk assessor's estimate of the issue; its assessment of this diff follows as a PR comment.
`;
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
function self(args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 2, 2], env: process.env });
  if (result.status !== 0) throw new Error(`${args.slice(0, 2).join(' ')} failed in ${cwd}`);
}
export function githubIo(lanes, gh = args => jsonCommand('gh', args)) {
  const repo = lanes.repo;
  const trees = () => parseWorktreeList(git('worktree', 'list', '--porcelain'));
  return {
    issue: n => gh(['issue', 'view', String(n), '--repo', repo, '--json', 'number,url,state,title,body,labels,assignees,milestone']),
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
    subIssues: n => gh(['api', `repos/${repo}/issues/${n}/sub_issues?per_page=100`]).map(sub => ({ number: sub.number, state: sub.state.toUpperCase() })),
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
        diffPaths: (gitIn(found.path, ['diff', '--name-only', `${base}...HEAD`]) || '').split('\n').filter(Boolean),
        subjects: (gitIn(found.path, ['log', '--reverse', '--format=%s', `${base}..HEAD`]) || '').split('\n').filter(Boolean),
      };
    },
    // Drive posts as the implementer identity, so only its comments count as assessments.
    assessment: (issue, pr) => latestAssessment(gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr ? pr.number : issue.number}/comments?per_page=100`]).flat(), lanes.implementer),
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
    push: tree => self(['push'], tree.path),
    open: (issue, tree, risk, hb) => {
      const body = join(workflowScratch(tree.path), `drive-${issue.number}-pr.md`);
      writeFileSync(body, prBody(issue, risk, hb, tree.subjects));
      const title = tree.subjects[0] || issue.title;
      run('gh', ['pr', 'create', '--repo', repo, '--draft', '--base', lanes.base, '--head', tree.branch, '--title', title, '--body-file', body]);
      const pr = gh(['pr', 'view', tree.branch, '--repo', repo, '--json', 'number']);
      run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--add-label', `risk:${risk}`]);
      try { run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--add-reviewer', lanes.reviewer]); } catch { console.error(`drive: could not request ${lanes.reviewer}'s review on #${pr.number}`); }
    },
    // When `state:reviewing` was last added to the PR, from its timeline; null when it never was.
    reviewingSince: pr => {
      const events = gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr.number}/timeline?per_page=100`]).flat();
      const at = events.filter(event => event.event === 'labeled' && event.label?.name === 'state:reviewing').at(-1)?.created_at;
      return at ? Date.parse(at) : null;
    },
    linkIssue: (pr, issue) => run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--body', `Closes #${issue.number}\n\n${pr.body || ''}`]),
    releaseReview: pr => run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, '--remove-label', 'state:reviewing']),
    risk: (pr, from, to) => run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, ...(from ? ['--remove-label', `risk:${from}`] : []), '--add-label', `risk:${to}`]),
    ready: (pr, tree) => self(['pr', 'ready', '--pr', String(pr.number)], tree?.path || process.cwd()),
    unclaim: issue => run('gh', ['issue', 'edit', String(issue.number), '--repo', repo, ...stateLabels(issue).flatMap(name => ['--remove-label', name])]),
    // A merge, never a rebase: the open PR keeps its review threads. Runs as the session's identity, the implementer.
    syncTree: tree => { if (gitIn(tree.path, ['fetch', '--quiet', 'origin', tree.branch]) !== null) gitIn(tree.path, ['merge', '--ff-only', '--quiet', 'FETCH_HEAD']); },
    updateBranch: pr => run('gh', ['pr', 'update-branch', String(pr.number), '--repo', repo]),
    autoMerge: (pr, tree) => self(['pr', 'auto-merge', '--pr', String(pr.number)], tree?.path || process.cwd()),
    close: issue => {
      const current = gh(['issue', 'view', String(issue.number), '--repo', repo, '--json', 'state']);
      if (current.state === 'OPEN') run('gh', ['issue', 'close', String(issue.number), '--repo', repo, '--reason', 'completed']);
    },
    board: (n, value) => board(lanes, n, value),
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
    openIssues: () => gh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', 'number,labels,body']),
  };
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
  const reviewingSince = claimed ? io.reviewingSince(pr) : null;
  // Only the assessment of the current phase is read: the issue's before a draft exists, then the PR's.
  const assessment = io.assessment(issue, pr?.state === 'OPEN' ? pr : null);
  const assessments = pr?.state === 'OPEN' ? { prAssessment: assessment } : { issueAssessment: assessment };
  return { issue, pr, tree, blockers, dropped, handBack, diffPaths, ...assessments, reviewingSince, now: io.now?.() ?? Date.now() };
}
// The risk that picks the models: the PR's label once a draft exists, else the issue assessment; never below the floor.
function currentRisk(facts, step) {
  const { issue, pr } = facts;
  if (step.agent === 'planner') return 'R2';
  const floor = riskLabel(issue.labels || []);
  return pr ? maxRisk(riskLabel(pr.labels || []), floor) : maxRisk(floor, facts.issueAssessment?.risk);
}
const briefs = { implementer: implementerBrief, reviewer: reviewerBrief, improver: improverBrief, devops: devopsBrief, planner: plannerBrief };
function instruction(io, facts, step, lanes) {
  const { issue, pr, tree } = facts;
  if (!step.agent) return step;
  const risk = currentRisk(facts, step);
  const assignment = deliveryAssignment(lanes.delivery, step, risk);
  const { model, host, session } = assignment;
  const brief = join(io.scratch(tree), `drive-${issue.number}-${step.agent}.md`);
  const round = pr ? prState(pr, lanes).round : 0;
  const context = { issue, pr, tree, step, risk, model, round, base: lanes.base, repo: lanes.repo, diffPaths: facts.diffPaths || [], prAssessment: facts.prAssessment, floor: riskLabel(issue.labels || []) };
  io.write(brief, briefs[step.agent](context));
  const out = { agent: step.agent, host, model, brief, issue: issue.number, pr: pr?.number ?? null, session, mode: step.mode, cwd: tree?.path || null };
  if (step.task) out.task = step.task;
  if (step.reason) out.reason = step.reason;
  if (step.resume) out.resume = true;
  if (step.agent === 'reviewer') out.command = reviewerCommand(model, brief, `review-${pr.number}-r${step.round}`, host, lanes.delivery?.executables?.[host] || host);
  return out;
}
function finish(step) {
  if (step.wait) return { ...step, command: waitCommandFor(step.wait.pr, step.wait.until) };
  return step;
}
export function driveIssue(io, n, lanes, handBack = {}) {
  for (let i = 0; i < 12; i++) {
    const facts = readIssueFacts(io, n, handBack);
    const step = decideIssue(facts, lanes);
    // A head moved on GitHub (a base merged by `update-branch`) reaches a clean worktree before an agent works in it.
    if (step.agent && facts.tree && facts.pr?.state === 'OPEN' && !facts.tree.dirty && !facts.tree.unpushed) io.syncTree(facts.tree);
    if (!step.do) return finish(instruction(io, facts, step, lanes));
    const { issue, pr, tree } = facts;
    if (step.do === 'start') { io.start(issue, pr?.headRefName); io.board(n, 'PROGRESS'); }
    else if (step.do === 'assess') {
      const floor = riskLabel(issue.labels || []);
      io.assess(issue, pr?.state === 'OPEN' ? pr : null, { risk: maxRisk(floor, step.risk), assessed: step.risk, floor, head: pr?.headRefOid ?? null, paths: pr ? facts.diffPaths : [], reason: step.reason });
    }
    else if (step.do === 'commit') io.commit(tree, handBack.commit, handBack.paths);
    else if (step.do === 'push') io.push(tree);
    else if (step.do === 'open') io.open(issue, tree, maxRisk(riskLabel(issue.labels || []), facts.issueAssessment?.risk || 'R1'), handBack);
    else if (step.do === 'release-review') io.releaseReview(pr);
    else if (step.do === 'link-issue') io.linkIssue(pr, issue);
    else if (step.do === 'risk') io.risk(pr, prState(pr, lanes).risk, step.risk);
    // A draft PR keeps its issue In progress; Review starts when the PR is marked ready. A ready PR also drops the
    // issue's claim, as spec's transition table states; the open PR still excludes reassignment.
    else if (step.do === 'ready') { io.ready(pr, tree); io.board(n, 'REVIEW'); if (stateLabels(issue).length) io.unclaim(issue); }
    else if (step.do === 'unclaim') io.unclaim(issue);
    else if (step.do === 'auto-merge') io.autoMerge(pr, tree);
    // GitHub reports the merge state late, so drive waits on the new head's CI instead of reading BEHIND again.
    else if (step.do === 'update-branch') { io.updateBranch(pr); return finish({ wait: { pr: pr.number, until: 'ci' }, reason: 'merged the base into the head' }); }
    else if (step.do === 'close') { io.close(issue); io.board(n, 'DONE'); }
    else if (step.do === 'remove-worktree') { io.removeTree(tree); return { done: { issue: n } }; }
  }
  throw new Error(`drive made no progress on #${n}; run status ${n}`);
}
function unresolvedDelivery(io, slice, base, ancestors = new Set()) {
  if (!slice || slice.state !== 'CLOSED' || ancestors.has(slice.number)) return [slice?.number].filter(Boolean);
  if (!isEpic(slice)) return io.mergedClosingPr(slice.number, base) ? [] : [slice.number];
  const seen = new Set([...ancestors, slice.number]);
  try {
    const children = io.subIssues(slice.number);
    if (!children.length) return [slice.number];
    return children.flatMap(child => {
      const issue = io.issue(child.number);
      return issue ? unresolvedDelivery(io, issue, base, seen) : [child.number];
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
  const refinement = marked[0] || io.createRefinement(epic);
  if (!marked.length) slices.push(refinement);
  const others = slices.filter(slice => slice !== refinement);
  const existing = io.allBlockers(refinement.number);
  for (const slice of others) if (!existing.includes(slice.number)) io.addBlocker(refinement.number, slice.number);
  // A closed slice without a merged closing PR holds only refinement and epic completion, not other open slices.
  const unresolved = others.filter(slice => slice.state !== 'OPEN').flatMap(slice => unresolvedDelivery(io, slice, lanes.base));
  const unresolvedOwner = unresolved.length ? { owner: `epic #${epic.number}: missing closing PR merged into ${lanes.base} for ${[...new Set(unresolved)].map(number => `#${number}`).join(', ')}`, url: epic.url } : null;
  // Read the refinement's links again after the repair; every open slice blocks it even before GitHub shows a new link.
  const repaired = splitDependencies(io.dependencies(refinement));
  refinement.blockers = [...new Set([...repaired.blockers, ...others.filter(slice => slice.state === 'OPEN').map(slice => slice.number)])];
  refinement.dropped = repaired.dropped;
  if (refinement.state !== 'OPEN' && !io.mergedClosingPr(refinement.number, lanes.base)) return { owner: `epic #${epic.number}: missing closing PR merged into ${lanes.base} for #${refinement.number}`, url: epic.url };
  const step = decideEpic({ epic, slices });
  if (unresolvedOwner && (step.do === 'close-epic' || step.slices?.includes(refinement.number))) return unresolvedOwner;
  if (step.do === 'close-epic' && !io.hasLessons(epic.number)) return instruction(io, { issue: epic, pr: null, tree: null }, agent('improver', 'improve'), lanes);
  if (step.do === 'close-epic') { io.closeEpic(epic); return { done: { epic: epic.number } }; }
  if (!step.slices) return finish(instruction(io, { issue: epic, pr: null, tree: null }, step, lanes));
  const entries = step.slices.map(number => { const facts = readIssueFacts(io, number, {}); return { number, pr: facts.pr, step: decideIssue(facts, lanes) }; });
  const chosen = pickSlice(holdBaseUpdates(entries));
  const result = driveIssue(io, chosen.number, lanes);
  const alsoReady = step.slices.filter(number => number !== chosen.number);
  return { ...result, epic: epic.number, ...(alsoReady.length ? { alsoReady } : {}) };
}
export function drive(io, n, lanes, handBack) {
  const issue = io.issue(n);
  // An epic advances from GitHub state alone: the planner's hand-back changes nothing drive reads.
  return isEpic(issue) ? driveEpic(io, issue, lanes) : driveIssue(io, n, lanes, handBack);
}
// --next: the lowest-numbered item that is ready, started issues first, then approved epics and standalone issues.
// An item with an unmet or dropped dependency never qualifies; `depsOf` reads them lazily, in that order.
export function nextTarget(issues, depsOf = () => ({ blockers: [], dropped: [] })) {
  const names = issue => issue.labels.map(label => label.name ?? label);
  const candidates = issues.filter(issue => !names(issue).includes('lane:owner'));
  const rank = issue => Number(!names(issue).includes('state:started'));
  const ordered = [...candidates].sort((a, b) => rank(a) - rank(b) || a.number - b.number);
  return ordered.find(issue => { const { blockers, dropped } = depsOf(issue); return !blockers.length && !dropped.length; })?.number ?? null;
}

export function driveCommand(args, lanes, io = githubIo(lanes)) {
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
    n = nextTarget(io.openIssues(), issue => splitDependencies(io.dependencies(issue)));
    if (n === null) { console.log(JSON.stringify({ done: { reason: 'no started issue, approved epic or standalone issue is ready' } })); return; }
  } else if (/^[1-9]\d*$/.test(args[0])) n = Number(args[0]);
  else throw new Error(usage);
  console.log(JSON.stringify(drive(io, n, lanes, handBack)));
}

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
  if (args.length) throw new Error('Usage: check');
  const test = lanes.steps?.test;
  if (!Array.isArray(test) || !test.length) throw new Error('Configure steps.test in .agents/config.json as a non-empty argv array');
  mkdirSync(directory, { recursive: true });
  const slot = chooseSlot(name => probe(directory, name));
  const result = runner(directory, [slot], test[0], test.slice(1), { timeoutSeconds: 3600, cwd: realpathSync(root) });
  if (result.status === lockTimeoutStatus) console.error('workflow: check waited an hour for a free gate slot');
  return result.status ?? 1;
}
