import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockTimeoutStatus, runWithLocks } from '../locks.mjs';
import { boardStatus, pathsFromIssueBody, prRecord } from './board.mjs';
import { cachedGithubMetadata, cleanEnvironment, ensureWorkflowLabels, git, jsonCommand, run, workflowScratch } from './core.mjs';
import { prFields } from './pr.mjs';
import { prState } from './state.mjs';
import { busyPaths, parseWorktreeList, removeWorktree, worktreeFacts } from './worktrees.mjs';

const cli = fileURLToPath(new URL('../workflow.mjs', import.meta.url));
const risks = ['R0', 'R1', 'R2'];
export const maxRisk = (...values) => risks[Math.max(...values.filter(Boolean).map(value => risks.indexOf(value)), 0)];
// Models follow risk for both the implementer and the Reviewer: Opus only for R2.
export const modelFor = risk => (risk === 'R2' ? 'opus' : 'sonnet');
const riskLabel = labels => labels.map(label => label.name ?? label).find(name => /^risk:R\d$/.test(name))?.slice(5) || null;

// The CODEOWNERS patterns the owner holds; those paths need the owner's judgment.
export function ownerPatterns(codeowners, owner) {
  if (!owner) return [];
  return codeowners.split('\n').map(line => line.replace(/#.*/, '').trim().split(/\s+/)).filter(([pattern, ...owners]) => pattern && owners.some(name => name.toLowerCase() === `@${owner.toLowerCase()}`)).map(([pattern]) => pattern);
}
export function matchesPattern(path, pattern) {
  const anchored = pattern.startsWith('/');
  const body = pattern.replace(/^\//, '').replace(/\/$/, '/**');
  const source = body.split('**').map(part => part.split('*').map(text => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp(`${anchored || pattern.replace(/\/$/, '').includes('/') ? '^' : '(^|/)'}${source}(/.*)?$`).test(path);
}
// R2 for owner paths, scripts or CI; R0 when every path is a skill, an agent definition or docs; R1 otherwise or with no paths.
export function riskFromPaths(paths, patterns = []) {
  if (!paths?.length) return 'R1';
  if (paths.some(path => patterns.some(pattern => matchesPattern(path, pattern)) || /(^|\/)scripts\//.test(path) || /^\.github\//.test(path) || /(^|\/)(justfile|Makefile|package\.json)$/.test(path))) return 'R2';
  if (paths.every(path => /(^|\/)(skills|docs|agents)\//.test(path) || /\.md$/.test(path))) return 'R0';
  return 'R1';
}
// At Start: the issue's risk label wins upward, then its scope packet's paths.
export function estimateRisk(issue, patterns) {
  return maxRisk(riskLabel(issue.labels || []), riskFromPaths(pathsFromIssueBody(issue.body || ''), patterns));
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

const isEpic = issue => (issue.labels || []).some(label => (label.name ?? label) === 'type:epic');
const agent = (agentName, mode, extra = {}) => ({ agent: agentName, mode, ...extra });

// One issue's next step from what was read about it, first match wins: a mechanical `do` for drive to perform, or a
// terminal `agent`, `wait`, `owner`, `blocked` or `done`. Pure, so re-running on unchanged state repeats it.
export function decideIssue(facts, lanes) {
  const { issue, pr, tree, handBack: hb = {}, blockers = [] } = facts;
  if (issue.state !== 'OPEN') return tree && pr?.state !== 'OPEN' ? { do: 'remove-worktree' } : { done: { issue: issue.number } };
  if (pr?.state === 'MERGED') return { do: 'close' };
  if (hb.status === 'replan') return agent('planner', 'replan', { reason: hb.note || 'the implementer asked to replan' });
  if (hb.status === 'blocked') return { owner: `#${issue.number}: ${hb.note || 'the implementer is blocked'}` };
  const claimed = (issue.labels || []).some(label => (label.name ?? label) === 'state:started');
  if (!pr || pr.state !== 'OPEN') {
    if (!claimed && blockers.length) return { blocked: { issue: issue.number, by: blockers } };
    if (!claimed || !tree) return { do: 'start' };
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
  const risk = maxRisk(state.risk, riskLabel(issue.labels || []), riskFromPaths(facts.diffPaths, facts.patterns));
  if (risk !== state.risk && risks.indexOf(risk) > risks.indexOf(state.risk)) return { do: 'risk', risk };
  if (state.labels.includes('state:reviewing')) return { wait: { pr: pr.number, until: 'reviewed' } };
  const next = state.next;
  if (next.action === 'fix') return tree ? agent('implementer', 'fix', { reason: next.reason, resume: true }) : { do: 'start' };
  if (next.action === 'wait-ci') return { wait: { pr: pr.number, until: 'ci' } };
  // An unapproved `ready` verdict on a ready PR asks only for the approval; anything else is a review round.
  if (next.action === 'review') {
    const approve = !pr.isDraft && state.verdict === 'ready';
    return agent('reviewer', approve ? 'approve' : 'review', { reason: approve ? 'no approval at the head' : next.reason || 'no verdict at the head', round: approve ? state.round : state.round + 1 });
  }
  if (next.action === 'split' ) return agent('planner', 'split', { reason: 'the Reviewer asked to split the change' });
  if (next.action === 'ready') return { do: 'ready' };
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

export function implementerBrief(f) {
  const fix = f.step.mode === 'fix';
  return `# Implementer brief: #${f.issue.number} ${f.issue.title}

Mode: ${f.step.mode}${f.step.reason ? ` (${f.step.reason})` : ''}. Risk ${f.risk}. Model ${modelFor(f.risk)}.
Issue: ${f.issue.url}
Worktree: ${f.tree.path} (branch ${f.tree.branch}, base origin/${f.base})
PR: ${f.pr ? `${f.pr.url} at ${f.pr.headRefOid}, round ${f.round}` : 'none yet; drive opens it'}

## Task

${fix ? 'Fix the failing check or the Blocker and Important findings of the newest review; `review-context` lists the open threads. Fix nothing else; Nits never block.' : 'Deliver the issue below so every acceptance criterion holds, with focused tests.'} Work only in the worktree. Run one plain command per Bash call.

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
export function reviewerBrief(f) {
  return `# Reviewer brief: PR #${f.pr.number} for #${f.issue.number}

Task: ${f.step.mode === 'approve' ? 'approve a ready PR whose newest verdict at its head is `ready` (review skill, references/approval.md)' : 'review the draft at its head (review skill, steps 1 to 5)'}.
PR: ${f.pr.url} at head ${f.pr.headRefOid}; round ${f.step.round}; risk ${f.risk}. Issue: ${f.issue.url}
${f.step.round > 1 ? 'Later round: judge only the delta `review-context` returns as `comparison`.\n' : ''}
## Commands you may run, one plain command per Bash call

- \`node ${cli} review-context --pr ${f.pr.number} --issue ${f.issue.number} --claim\`
- \`node ${cli} wait ${f.pr.number} --until ci\`, \`node ${cli} status ${f.pr.number}\`, \`node ${cli} scratch\`
- \`node ${cli} review-post --pr ${f.pr.number} --sha ${f.pr.headRefOid} --event COMMENT|APPROVE --body-file <F> [--comments-file <C>]\`
${f.step.mode === 'approve' ? `- \`node ${cli} pr auto-merge --pr ${f.pr.number}\` as the Reviewer\n` : ''}
Never edit, commit or push, never start an agent and never print a token.

## Hand-back, at most 5 lines

verdict, PR, head, round, tag counts.
`;
}
export function plannerBrief(f) {
  return `# Planner brief: #${f.issue.number} ${f.issue.title}

Task: ${f.step.mode === 'slice' ? 'slice this approved epic into sub-issues, each deliverable alone, with blocked-by links between dependent slices' : `${f.step.reason}; reshape the issue at its logical seam into sub-issues or a revised scope`}. Invoke the \`spec\` skill for the issue form.
Issue: ${f.issue.url}
Commands: \`node ${cli} issue create ...\`, \`node ${cli} issue edit ...\`, \`gh api\` to link sub-issues and blocked-by dependencies.
Never write code and never start an agent. Agree each slice with the owner.

## Hand-back, at most 5 lines

status: sliced | blocked
slices: <issue numbers>
note: <one line>

## Issue

${f.issue.body || '(no body)'}
`;
}
// The Reviewer runs as a separate non-interactive session, so the session that wrote the PR never approves it.
export function reviewerCommand(model, brief, name) {
  return ['claude', '--print', '--agent', 'filipkrawiec-workflow:reviewer', '--model', model, '--permission-mode', 'auto', '--name', name, `Follow your brief at ${brief}. Return at most 5 lines.`];
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

Risk ${risk}, from the issue's scope and the diff.
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
export function githubIo(lanes) {
  const repo = lanes.repo;
  const gh = args => jsonCommand('gh', args);
  const trees = () => parseWorktreeList(git('worktree', 'list', '--porcelain'));
  return {
    issue: n => gh(['issue', 'view', String(n), '--repo', repo, '--json', 'number,url,state,title,body,labels,assignees']),
    blockers: n => gh(['api', `repos/${repo}/issues/${n}/dependencies/blocked_by`]).filter(dep => dep.state === 'open').map(dep => dep.number),
    subIssues: n => gh(['api', `repos/${repo}/issues/${n}/sub_issues?per_page=100`]).map(sub => ({ number: sub.number, state: sub.state.toUpperCase() })),
    pr: n => {
      const open = gh(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', 'number,body,closingIssuesReferences,labels,reviews,headRefOid,isDraft']);
      // A stacked PR's base is not the default branch, so GitHub links no closing issue; its body's `Closes #N` still does.
      const closes = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?) #${n}\\b`, 'i');
      const found = open.find(candidate => prRecord({ ...candidate, labels: candidate.labels || [] }, lanes).issues.includes(n) || closes.test(candidate.body || ''));
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
    patterns: () => ownerPatterns(gitIn(trees()[0].path, ['show', `origin/${lanes.base}:.github/CODEOWNERS`]) || '', lanes.owner),
    start: (issue, risk, prBranch) => {
      try { ensureWorkflowLabels(repo); } catch { /* labels may already exist */ }
      const stale = issue.labels.map(label => label.name).filter(name => /^risk:R\d$/.test(name) && name !== `risk:${risk}`);
      run('gh', ['issue', 'edit', String(issue.number), '--repo', repo, '--add-label', 'state:started', '--add-label', `risk:${risk}`, ...stale.flatMap(name => ['--remove-label', name]), ...(lanes.implementer ? ['--add-assignee', lanes.implementer] : [])]);
      const root = trees()[0].path; const branch = prBranch || slugBranch(issue); const path = join(root, '.worktrees', branch);
      git('fetch', '--quiet', 'origin');
      if (!existsSync(path)) {
        const exists = gitIn(root, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]);
        if (exists || prBranch) git('-C', root, 'worktree', 'add', path, branch);
        else git('-C', root, 'worktree', 'add', '-b', branch, path, `origin/${lanes.base}`);
      }
      board(lanes, issue.number, 'PROGRESS');
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
      board(lanes, issue.number, 'REVIEW');
    },
    risk: (pr, from, to) => run('gh', ['pr', 'edit', String(pr.number), '--repo', repo, ...(from ? ['--remove-label', `risk:${from}`] : []), '--add-label', `risk:${to}`]),
    ready: (pr, tree) => self(['pr', 'ready', '--pr', String(pr.number)], tree?.path || process.cwd()),
    autoMerge: (pr, tree) => self(['pr', 'auto-merge', '--pr', String(pr.number)], tree?.path || process.cwd()),
    close: issue => {
      const current = gh(['issue', 'view', String(issue.number), '--repo', repo, '--json', 'state']);
      if (current.state === 'OPEN') run('gh', ['issue', 'close', String(issue.number), '--repo', repo, '--reason', 'completed']);
      board(lanes, issue.number, 'DONE');
    },
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
    openIssues: () => gh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', 'number,labels']),
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
  const blockers = pr ? [] : io.blockers(n);
  const diffPaths = [...new Set([...(tree?.diffPaths || []), ...(pr?.files || []).map(file => file.path)])];
  return { issue, pr, tree, blockers, handBack, diffPaths, patterns: io.patterns() };
}
function instruction(io, facts, step, lanes) {
  const { issue, pr, tree } = facts;
  if (!step.agent) return step;
  const risk = maxRisk(riskLabel(pr?.labels || []), riskLabel(issue.labels || []), step.agent === 'planner' ? 'R2' : null);
  const model = step.agent === 'planner' ? 'opus' : modelFor(risk);
  const brief = join(io.scratch(tree), `drive-${issue.number}-${step.agent}.md`);
  const round = pr ? prState(pr, lanes).round : 0;
  const context = { issue, pr, tree, step, risk, round, base: lanes.base };
  io.write(brief, step.agent === 'implementer' ? implementerBrief(context) : step.agent === 'reviewer' ? reviewerBrief(context) : plannerBrief(context));
  const out = { agent: step.agent, model, brief, issue: issue.number, pr: pr?.number ?? null, session: step.agent === 'reviewer' ? 'separate' : 'subagent', mode: step.mode, cwd: tree?.path || null };
  if (step.reason) out.reason = step.reason;
  if (step.resume) out.resume = true;
  if (step.agent === 'reviewer') out.command = reviewerCommand(model, brief, `review-${pr.number}-r${step.round}`);
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
    if (!step.do) return finish(instruction(io, facts, step, lanes));
    const { issue, pr, tree } = facts;
    if (step.do === 'start') io.start(issue, estimateRisk(issue, facts.patterns), pr?.headRefName);
    else if (step.do === 'commit') io.commit(tree, handBack.commit, handBack.paths);
    else if (step.do === 'push') io.push(tree);
    else if (step.do === 'open') io.open(issue, tree, maxRisk(riskLabel(issue.labels), riskFromPaths(facts.diffPaths, facts.patterns)), handBack);
    else if (step.do === 'risk') io.risk(pr, prState(pr, lanes).risk, step.risk);
    else if (step.do === 'ready') io.ready(pr, tree);
    else if (step.do === 'auto-merge') io.autoMerge(pr, tree);
    else if (step.do === 'close') io.close(issue);
    else if (step.do === 'remove-worktree') { io.removeTree(tree); return { done: { issue: n } }; }
  }
  throw new Error(`drive made no progress on #${n}; run status ${n}`);
}
export function driveEpic(io, epic, lanes) {
  const slices = io.subIssues(epic.number).map(slice => ({ ...slice, blockers: slice.state === 'OPEN' ? io.blockers(slice.number) : [] }));
  const step = decideEpic({ epic, slices });
  if (step.do === 'close-epic') { io.closeEpic(epic); return { done: { epic: epic.number } }; }
  if (!step.slices) return finish(instruction(io, { issue: epic, pr: null, tree: null }, step, lanes));
  const entries = step.slices.map(number => ({ number, step: decideIssue(readIssueFacts(io, number, {}), lanes) }));
  const chosen = pickSlice(entries);
  const result = driveIssue(io, chosen.number, lanes);
  const alsoReady = step.slices.filter(number => number !== chosen.number);
  return { ...result, epic: epic.number, ...(alsoReady.length ? { alsoReady } : {}) };
}
export function drive(io, n, lanes, handBack) {
  const issue = io.issue(n);
  // An epic advances from GitHub state alone: the planner's hand-back changes nothing drive reads.
  return isEpic(issue) ? driveEpic(io, issue, lanes) : driveIssue(io, n, lanes, handBack);
}
// --next: issues already started first, then approved epics (no lane:owner), lowest number first.
export function nextTarget(issues) {
  const names = issue => issue.labels.map(label => label.name ?? label);
  const started = issues.filter(issue => names(issue).includes('state:started') && !names(issue).includes('type:epic'));
  const epics = issues.filter(issue => names(issue).includes('type:epic') && !names(issue).includes('lane:owner'));
  return [...started, ...epics].sort((a, b) => Number(names(b).includes('state:started')) - Number(names(a).includes('state:started')) || a.number - b.number)[0]?.number ?? null;
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
    n = nextTarget(io.openIssues());
    if (n === null) { console.log(JSON.stringify({ done: { reason: 'nothing started and no approved epic is open' } })); return; }
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
