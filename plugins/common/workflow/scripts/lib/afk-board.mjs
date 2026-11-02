import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  afkGh,
  git,
  missingProjectScope,
  run,
} from './core.mjs';

export function afkComments(cfg, issue) { return afkGh(['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${issue}/comments`]).flat(); }
// The issue's fenced `scope` JSON packet; an invalid packet is treated as absent.
function afkScopePacket(body) {
  const scope = /```scope[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(body);
  try { return scope ? JSON.parse(scope[1]) : null; } catch { return null; }
}
export function afkPathsFromIssueBody(body = '') {
  if (/\b(?:make\s+no|do\s+not\s+make(?:\s+any)?)\s+(?:repository|repo)\s+(?:changes|files|commits)\b/i.test(body)) return [];
  const parsed = afkScopePacket(body)?.paths;
  if (Array.isArray(parsed) && parsed.length && parsed.every(value => typeof value === 'string' && value.trim() && value.trim() !== '.')) return parsed.map(value => value.startsWith('./') ? value.slice(2) : value.replace(/^\//, ''));
  return null;
}
// The packet's dependencies as issue or PR numbers (`12` or `"#12"`); a missing or invalid packet has none.
export function afkDependenciesFromIssueBody(body = '') {
  const parsed = afkScopePacket(body)?.dependencies;
  return Array.isArray(parsed) ? parsed.map(value => Number(String(value).trim().replace(/^#/, ''))).filter(Number.isInteger) : [];
}
function afkIssues(cfg) {
  const [owner, name] = cfg.repo.split('/');
  const fields = 'number title body lastEditedAt labels(first:30){nodes{name}} blockedBy(first:30){nodes{state}} milestone{number dueOn} subIssuesSummary{total completed} parent{number parent{number parent{number parent{number}}}}';
  const query = withPriority => `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){issues(states:OPEN,first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{${fields}${withPriority ? ' projectItems(first:10){nodes{project{number} priority: fieldValueByName(name:"Priority"){... on ProjectV2ItemFieldSingleSelectValue{name}} status: fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}' : ''}}}}}`;
  const found = []; let after;
  do {
    const args = ['api', 'graphql', '-f', `query=${query(Boolean(cfg.project?.number))}`, '-F', `owner=${owner}`, '-F', `name=${name}`];
    if (after) args.push('-F', `after=${after}`);
    let page;
    try { page = afkGh(args).data.repository.issues; }
    catch (error) {
      if (!cfg.project?.number || !missingProjectScope(error)) throw error;
      page = afkGh(['api', 'graphql', '-f', `query=${query(false)}`, '-F', `owner=${owner}`, '-F', `name=${name}`, ...(after ? ['-F', `after=${after}`] : [])]).data.repository.issues;
    }
    found.push(...page.nodes.map(issue => {
      const labels = issue.labels.nodes.map(label => label.name);
      const card = issue.projectItems?.nodes.find(item => item.project.number === cfg.project?.number);
      const priority = card?.priority?.name || 'P9', status = card?.status?.name || null;
      const ancestors = []; let parent = issue.parent;
      while (parent) { ancestors.push(parent.number); parent = parent.parent; }
      const paths = afkPathsFromIssueBody(issue.body || '');
      return { ...issue, labels, priority, status, ancestors, paths, dependencies: afkDependenciesFromIssueBody(issue.body || ''), blocked: issue.blockedBy.nodes.some(dep => dep.state === 'OPEN') };
    }));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return found;
}
export function afkPriority(value) { return ({ P0: 0, P1: 1, P2: 2 })[value] ?? 9; }
// The list names only a renamed file's new path, may omit changeType and stops at 100 files, so those PRs re-read their files over REST;
// a failed read marks only that PR's files unread.
export function afkPrFiles(pr, readPages) {
  if (!pr.files?.some(file => !file.changeType || file.changeType === 'RENAMED') && (pr.files?.length || 0) < 100) return pr;
  try {
    return { ...pr, files: readPages(pr.number).flat().map(file => ({ path: file.filename, previousPath: file.previous_filename })) };
  } catch (error) {
    console.error(`PR #${pr.number}: its files could not be read, so its fix waits for a later plan (${error.message})`);
    return { ...pr, filesUnread: true };
  }
}
export function afkPrData(cfg) {
  return afkGh(['pr', 'list', '--repo', cfg.repo, '--state', 'open', '--limit', '1000', '--json', 'number,title,body,headRefOid,labels,reviews,isDraft,statusCheckRollup,mergeable,files,closingIssuesReferences'])
    .map(pr => afkPrFiles(pr, number => afkGh(['api', '--paginate', '--slurp', `repos/${cfg.repo}/pulls/${number}/files`])));
}
// A review carrying the `agent-review` marker is a verdict; an unmarked COMMENTED review from a workflow identity is a
// thread reply; any other review is someone's input.
export function afkReviewKind(review, cfg) {
  if (/<!-- agent-review\b/.test(review.body || '')) return 'verdict';
  return review.state === 'COMMENTED' && afkWorkflowLogins(cfg).has(review.author?.login?.toLowerCase()) ? 'reply' : 'other';
}
// Approves on the newest Reviewer verdict; thread replies never decide. A Reviewer change request at the head blocks
// whether marked or not, so that check reads the review state rather than its kind.
export function afkReviewerApproved(pr, cfg) {
  const mine = (pr.reviews || []).filter(review => review.author?.login?.toLowerCase() === cfg.reviewer.toLowerCase());
  const latest = mine.filter(review => afkReviewKind(review, cfg) === 'verdict').at(-1); const head = pr.headRefOid;
  const ownerLane = pr.labels?.some(label => label.name === 'review:owner');
  return Boolean(latest?.state === 'APPROVED' && latest.commit?.oid === head && latest.body.includes(`sha=${head}`) && latest.body.includes(`verdict=${ownerLane ? 'owner' : 'ready'}`) &&
    !mine.some(review => review.state === 'CHANGES_REQUESTED' && review.commit?.oid === head));
}
// A PR delivers the issues GitHub records it closing in this repository, and those a line starting `Part of #N` names:
// a slice PR gets no closing link, yet it delivers its issue. A bare mention links nothing.
export function prLinkedIssues(pr, repo) {
  const closes = (pr.closingIssuesReferences || []).filter(issue => `${issue.repository?.owner?.login}/${issue.repository?.name}`.toLowerCase() === repo.toLowerCase()).map(issue => issue.number);
  const parts = [...(pr.body || '').matchAll(/^\s*Part of #(\d+)\b/gim)].map(match => Number(match[1]));
  return [...new Set([...closes, ...parts])];
}
export function afkPrRecord(pr, cfg) {
  const issues = prLinkedIssues(pr, cfg.repo);
  const reviews = pr.reviews || [];
  const mine = reviews.filter(review => review.author?.login?.toLowerCase() === cfg.reviewer.toLowerCase());
  const head = pr.headRefOid;
  const approved = afkReviewerApproved(pr, cfg);
  const ownerMine = reviews.filter(review => review.author?.login?.toLowerCase() === cfg.owner?.toLowerCase()).at(-1);
  const ownerApproved = Boolean(cfg.owner && ownerMine?.state === 'APPROVED' && ownerMine.commit?.oid === head);
  // A dismissed review (say, after the merge base changed) no longer reviews the head, so the PR awaits a fresh verdict.
  const reviewerReviewedHead = mine.some(review => review.commit?.oid === head && review.state !== 'DISMISSED');
  const checks = pr.statusCheckRollup || [];
  const failed = checks.some(check => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes((check.conclusion || check.state || '').toUpperCase()));
  const broken = pr.mergeable === 'CONFLICTING' || failed;
  const awaitingReview = !reviewerReviewedHead;
  const needsWork = broken || awaitingReview || (!pr.labels.some(label => label.name === 'review:owner') && !approved);
  return { ...pr, issues, approved, ownerApproved, awaitingReview, failed, broken, needsWork };
}
// What a PR unit's run acts on: its head, its review decisions (a dismissal counts), whether an approval stands at the head,
// its checks, its merge state, the base head and the last comment from someone outside the workflow. A run's own hold,
// release, notes and thread replies never change it, so a run that changed nothing leaves the same state behind; a run
// that waited on a red base or a conflict is served after the next merge.
export function afkPrState(pr, comments, cfg, base = '') {
  const decisions = (pr.reviews || []).filter(review => afkReviewKind(review, cfg) !== 'reply');
  const reviews = `${decisions.length}/${decisions.filter(review => review.state === 'DISMISSED').length}${pr.approved ? '+' : ''}`;
  return `${pr.headRefOid}:${reviews}:${pr.failed ? 'red' : 'green'}:${(pr.mergeable || 'UNKNOWN').toLowerCase()}:${base}:${afkOutsideInput(comments, cfg)}`;
}
function afkWorkflowLogins(cfg) { return new Set([cfg.implementer, cfg.reviewer].filter(Boolean).map(login => login.toLowerCase())); }
// The last comment from someone outside the workflow; the workflow's own markers and notes are never new input.
function afkOutsideInput(comments, cfg) {
  const workflow = afkWorkflowLogins(cfg);
  return comments.filter(comment => !workflow.has(comment.user?.login?.toLowerCase()) && !/^<!-- afk-/.test(comment.body || '')).at(-1)?.id ?? '';
}
// What an issue unit's run acts on: its column, body, labels, open blockers and outside input, and an epic's slice counts.
// A Blocked card and an epic whose slices all closed also read the base head, so a blocker a refine run could not clear, or
// a close check waiting on a deployment, is tried again after the next merge.
export function afkIssueState(issue, column, comments, cfg, base = '') {
  const slices = issue.labels.includes('type:epic') ? issue.subIssuesSummary || { total: 0, completed: 0 } : null;
  const retry = column === 'Blocked' || (slices?.total > 0 && slices.completed === slices.total);
  return `${column}:${issue.lastEditedAt || ''}:${[...issue.labels].sort().join(',')}:${issue.blocked ? 'blocked' : ''}:${afkOutsideInput(comments, cfg)}${slices ? `:${slices.completed}/${slices.total}` : ''}${retry ? `:${base}` : ''}`;
}
function afkSpentPath() { return join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'afk-spent.json'); }
// Every ping serves the first free unit in this board order; Priority, then the oldest number, decides inside a column.
export const afkColumns = ['Blocked', 'Review', 'Todo', 'Backlog'];
// An issue's column; without a board card, `lane:afk` is Todo and anything else Backlog.
export function afkColumn(issue) { return issue.status || (issue.labels.includes('lane:afk') ? 'Todo' : 'Backlog'); }
// The job each column gives its run.
function afkUnitText(column, issue) {
  if (column === 'Blocked') return `#${issue.number} is Blocked: invoke \`refine\` on it alone to clear its blocker and move it to Todo; if it cannot be cleared yet, comment why and leave it Blocked`;
  if (column === 'Backlog') return `#${issue.number} is in Backlog: invoke \`refine\` on it alone, with \`agent-review\` eligibility for \`lane:proposed\`, to make it ready and move it to Todo`;
  if (issue.labels.includes('type:epic')) return `epic #${issue.number} is in Todo: slice it if it has no sub-issues, otherwise verify its delivery and close it`;
  if (issue.paths === null) return `#${issue.number} is in Todo without a valid scope packet: invoke \`refine\` on it alone to add one`;
  return `#${issue.number} is ready`;
}
export function afkPlan(cfg, live, threads, me = '', data = null) {
  const issues = data?.issues || afkIssues(cfg); const prs = (data?.prs || afkPrData(cfg)).map(pr => afkPrRecord(pr, cfg));
  // A unit a finished run left unchanged gets no new run until something about it changes. Given issues, the ledger and base come from data too.
  const spent = data?.issues ? data.spent || {} : afkReadLedger(afkSpentPath()), unchanged = [], orphans = [], units = [], held = [];
  const base = data?.issues ? data.base || '' : (() => { try { return git('rev-parse', 'refs/remotes/origin/HEAD'); } catch { return ''; } })();
  const byNumber = new Map(issues.map(issue => [issue.number, issue]));
  // A run that split its held issue builds the first sub-issue under that hold, so a hold on a parent In progress (or with
  // no card) also covers its direct sub-issues; a refine hold on a Blocked or Backlog epic, or one on a grandparent, does not.
  // `except` is the run whose holds do not count: this run for heldElsewhere, none for whether anyone works on a PR.
  const holdsOf = (number, except) => afkLiveHolds(threads(number), live, me).some(hold => hold.run !== except);
  const heldBy = (number, except) => {
    const parent = byNumber.get(byNumber.get(number)?.ancestors?.[0]);
    return holdsOf(number, except) || Boolean(parent && [null, undefined, 'In progress'].includes(parent.status) && holdsOf(parent.number, except));
  };
  const heldElsewhere = number => heldBy(number, me);
  // An open PR holds overlapping builds only while someone works on it: a live run holds it or an issue it delivers, or that
  // issue went Blocked at the current base head. A PR nobody works on holds nothing, so a stalled PR cannot stop the repository.
  const blockedAtBase = number => Boolean(base) && byNumber.get(number)?.status === 'Blocked' && afkBlockedBase(threads(number)) === base;
  const worked = pr => [pr.number, ...pr.issues].some(number => heldBy(number, null)) || pr.issues.some(blockedAtBase);
  // Shared files every change touches (`afk.alwaysInScope`) never overlap.
  const shared = Array.isArray(cfg.alwaysInScope) ? cfg.alwaysInScope : [];
  const overlaps = (pr, scope) => (pr.files || []).some(file => [file.path, file.previousPath].some(path => path && !afkPathsWithinScope([path], shared) && afkPathsWithinScope([path], scope)));
  const inPr = new Set(prs.flatMap(pr => pr.issues)), openPrs = new Set(prs.map(pr => pr.number));
  const offer = (unit, key, state) => {
    if (spent[key] === state) { unchanged.push(key); return; }
    units.push({ ...unit, state });
  };
  for (const issue of issues) {
    let column = afkColumn(issue);
    // `state:started` is an exclusive attended assignment: never orphaned, never offered.
    if (issue.labels.includes('lane:owner') || issue.labels.includes('state:started') || heldElsewhere(issue.number)) continue;
    // A card In progress with no live run, or in Review with no open PR, is Todo again. An approved epic In progress is
    // served to slice it, stays In progress while its slices are open and comes back for its close check once they all closed.
    const epic = issue.labels.includes('type:epic'), slices = issue.subIssuesSummary;
    if (epic && column === 'In progress' && slices && slices.completed === slices.total) column = 'Todo';
    else if (!epic && ['In progress', 'Review'].includes(column) && !inPr.has(issue.number)) { orphans.push(issue.number); column = 'Todo'; }
    // An issue an open PR names is served through that PR's unit; a refine run cannot clear an open PR, and its hold would keep the PR unit back.
    if (!['Blocked', 'Todo', 'Backlog'].includes(column) || inPr.has(issue.number)) continue;
    // The board grants no authority: a Todo story without `lane:afk` is refined like Backlog.
    if (column === 'Todo' && !epic && !issue.labels.includes('lane:afk')) column = 'Backlog';
    if (column === 'Todo') {
      if (epic && !(slices && (slices.total === 0 || slices.completed === slices.total))) continue;
      // A ready issue waits for its open blockers and for an open PR its packet depends on; a packet-less story is refined meanwhile.
      if ((epic || issue.paths !== null) && (issue.blocked || (issue.dependencies || []).some(number => openPrs.has(number)))) continue;
      // It also waits while an open PR changes a file its packet covers: two builds in one area conflict on each merge.
      const overlap = Array.isArray(issue.paths) && prs.find(pr => !pr.filesUnread && overlaps(pr, issue.paths) && worked(pr));
      if (overlap) { held.push({ issue: issue.number, pr: overlap.number }); continue; }
    }
    const write = column === 'Todo' && !epic && issue.paths !== null;
    offer({ column, text: afkUnitText(column, issue), issue: issue.number, priority: issue.priority, paths: write ? issue.paths : [], ...(write ? {} : { refine: true }), input: afkOutsideInput(threads(issue.number), cfg) }, issue.number, afkIssueState(issue, column, threads(issue.number), cfg, base));
  }
  for (const pr of prs) {
    if (!pr.needsWork || pr.issues.some(heldElsewhere) || heldElsewhere(pr.number) || pr.issues.some(number => byNumber.get(number)?.labels.includes('state:started'))) continue;
    const stories = pr.issues.map(number => byNumber.get(number)).filter(issue => issue && !issue.labels.includes('type:epic'));
    if (!pr.awaitingReview && !pr.broken && stories.length > 0 && stories.every(issue => issue.labels.includes('lane:owner'))) continue;
    // Its issues' packets, then the PR's own packet, then the files it already changes.
    const packet = stories.some(issue => Array.isArray(issue.paths)) ? stories.flatMap(issue => issue.paths || []) : afkPathsFromIssueBody(pr.body || '');
    const scopedByFiles = packet === null && !pr.filesUnread;
    const paths = packet ?? (scopedByFiles ? (pr.files || []).flatMap(file => [file.path, file.previousPath].filter(Boolean)) : null);
    const review = pr.awaitingReview && !pr.broken;
    // A fix scoped by files that could not be read waits for a later plan rather than holding an incomplete scope.
    if (!review && paths === null) continue;
    const priority = stories.map(issue => issue.priority).sort((a, b) => afkPriority(a) - afkPriority(b))[0];
    const unit = review
      ? { column: 'Review', text: `PR #${pr.number} (${pr.title}) awaits its review`, issue: pr.number, priority, paths: [], review: true, pr: pr.number, head: pr.headRefOid }
      : { column: 'Review', text: `PR #${pr.number} (${pr.title})${pr.broken ? ' has a red check or a conflict' : ' needs its review fixed'}`, issue: stories[0]?.number || pr.number, priority, paths, ...(scopedByFiles ? { scopedByFiles } : {}), pr: pr.number, head: pr.headRefOid };
    offer(unit, pr.number, afkPrState(pr, threads(pr.number), cfg, base));
  }
  units.sort((a, b) => afkColumns.indexOf(a.column) - afkColumns.indexOf(b.column) || afkPriority(a.priority) - afkPriority(b.priority) || (a.pr ?? a.issue) - (b.pr ?? b.issue));
  return { units, prs, byNumber, threads, unchanged, orphans, held };
}
// Every tick merges ready PRs before it plans: the plan re-reads the open PRs, so it neither serves nor holds a build behind a PR
// merged this tick. `merge: false` skips merging for a tick another step already merged for.
export function afkMergeThenPlan(cfg, { readPrs = () => afkPrs(cfg), gh, issues, merge = true } = {}) {
  const merged = merge ? afkMerge(cfg, readPrs(), null, gh) : [];
  return { merged, plan: (live, threads, me = '') => afkPlan(cfg, live, threads, me, { ...(issues ? { issues } : {}), prs: readPrs() }) };
}
// Why `afk start --issue` could not hold an issue; a packet-less issue names its missing packet, which a refine run adds.
export function afkStartRefusal(number, issue) {
  const packetless = issue && issue.paths === null && issue.labels.includes('lane:afk') && !issue.labels.includes('type:epic');
  return new Error(`#${number} is not an eligible AFK candidate${packetless ? ': it has no valid scope packet, and no refine unit for it is offered now' : ''}`);
}
// A clean run spends its issue unit's state as the run left it, so the run's own body, label and comment changes never
// re-offer the unit. It keeps the start state, so the unit is offered again, when the unit changed column or kind (a refine
// that added the packet becomes a build), when outside input arrived during the run, and for PR units.
export function afkSpentState(held, units) {
  const now = held.pr ? null : units.find(unit => !unit.pr && unit.issue === held.number);
  const same = now && now.column === held.column && Boolean(now.refine) === Boolean(held.refine) && held.input !== undefined && now.input === held.input;
  return same ? now.state : held.state;
}
// The spent-ledger entries a run's end writes: none unless its agent exited cleanly. The end states are read before the
// holds are released; when they cannot be read, the start states are spent, as before end states existed.
export function afkSpentEntries(dropped, spend, readUnits) {
  if (!spend || !dropped.some(held => held.state)) return {};
  let units = [];
  if (dropped.some(held => held.state && !held.pr)) try { units = readUnits(); } catch (error) { console.error(`End states unreadable (${error.message}); spending start states.`); }
  return Object.fromEntries(dropped.filter(held => held.state).map(held => [held.pr ?? held.number, afkSpentState(held, units)]));
}
// The base head the newest Blocked note on an issue records, or '' without one.
export function afkBlockedBase(comments) {
  const note = comments.filter(comment => /^<!-- afk-issue-blocked\b/.test(comment.body || '')).at(-1);
  return /base head `([0-9a-f]{7,40})`/.exec(note?.body || '')?.[1] || '';
}
// One line per Todo build a plan holds behind an overlapping open PR; afk check and afk start both print them.
export function afkHeldLines(held) { return held.map(hold => `Held: #${hold.issue} overlaps open PR #${hold.pr}; no build while a run works on it or it is Blocked at this base`); }
// The units no other live run holds, in board order.
export function* afkCandidates(units, others) {
  const taken = new Set(others.flatMap(hold => [hold.number, hold.pr].filter(Boolean)));
  for (const unit of units) if (!taken.has(unit.issue) && !taken.has(unit.pr)) yield { number: unit.issue, paths: unit.paths, unit };
}
// At most afk.maxRuns runs are live, booting ones included, and each ping starts at most one.
export function afkFree(cfg, live, me = '') { return Math.max(0, (Number(cfg.maxRuns) || 4) - live.filter(id => id !== me).length); }
export function afkLiveHolds(comments, live, me) {
  const holds = [];
  for (const comment of comments) for (const match of (comment.body || '').matchAll(/<!-- afk-(epic|issue)-hold session=(\S+) -->/g)) {
    if (match[2] === me || live.includes(match[2])) holds.push({ comment: comment.id, run: match[2], kind: match[1] });
  }
  return holds.sort((a, b) => Number(a.comment) - Number(b.comment));
}
export function afkReadLedger(path) {
  try { const data = JSON.parse(readFileSync(path, 'utf8')); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; }
  catch { return {}; }
}
export function afkWriteLedger(path, ledger) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(ledger)); renameSync(temp, path);
}
export function afkPathsWithinScope(paths, scope) {
  if (!Array.isArray(paths)) return false;
  if (scope === null) return true;
  if (!Array.isArray(scope)) return false;
  return paths.every(path => scope.some(value => {
    const root = value.replace(/^\.\//, '').replace(/\/+$/, '');
    return root && (path === root || path.startsWith(`${root}/`));
  }));
}
export function afkPrs(cfg) {
  return afkPrData(cfg);
}
export function afkMerge(cfg, prs, wanted = null, gh = args => spawnSync('gh', args, { encoding: 'utf8' })) {
  const messages = [];
  for (const pr of prs) {
    if (wanted && !wanted.has(pr.number)) continue;
    const checks = pr.statusCheckRollup || [];
    const passed = checks.length && checks.every(c => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes((c.conclusion || c.state || '').toUpperCase()));
    if (pr.isDraft) {
      if (passed && pr.mergeable === 'MERGEABLE') { run('gh', ['pr', 'ready', String(pr.number), '--repo', cfg.repo]); messages.push(`PR #${pr.number} marked ready`); }
      continue;
    }
    const head = pr.headRefOid;
    const ownerLane = pr.labels?.some(l => l.name === 'review:owner');
    const ownerReviews = (pr.reviews || []).filter(r => r.author?.login?.toLowerCase() === cfg.owner?.toLowerCase());
    const ownerLatest = ownerReviews.at(-1);
    const approved = afkReviewerApproved(pr, cfg);
    const ownerNeeded = ownerLane && !(ownerLatest?.state === 'APPROVED' && ownerLatest.commit?.oid === head);
    const failed = checks.some(c => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes((c.conclusion || c.state || '').toUpperCase()));
    if (!passed || !approved || ownerNeeded || failed || pr.mergeable === 'CONFLICTING') continue;
    const args = ['pr', 'merge', String(pr.number), '--repo', cfg.repo, '--squash', '--match-head-commit', head];
    const merged = gh(args);
    const queued = merged.status === 0 ? null : gh([...args, '--auto']);
    messages.push(`PR #${pr.number} ${merged.status === 0 ? 'merged' : queued?.status === 0 ? 'will merge after checks' : 'merge refused'}`);
  }
  return messages;
}
