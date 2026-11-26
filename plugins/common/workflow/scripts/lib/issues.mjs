import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { consolidatedInto } from './dependencies.mjs';
import { boardStatus, sweepBoard, pathsFromIssueBody, pathsWithinScope } from './board.mjs';
import {
  cachedGithubMetadata,
  config,
  ensureWorkflowLabels,
  flags,
  gh,
  githubRepoFromRemote,
  git,
  loadEnvironment,
  requireImplementer,
  withRepoLock,
  writerConfig,
} from './core.mjs';

export function validateIssueCommentBody(body) {
  if (typeof body !== 'string' || !body.trim() || body.length > 60_000) throw new Error('Issue comment body must contain 1–60000 characters');
  return body;
}
export function workspaceFilePath(root, path) {
  const canonicalRoot = realpathSync(root);
  const canonicalFile = realpathSync(resolve(path));
  const fromRoot = relative(canonicalRoot, canonicalFile);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error('Body file must be inside the current worktree: write it under .wf/ (run `scratch`) or pass - to read stdin');
  const file = statSync(canonicalFile);
  if (!file.isFile()) throw new Error('Issue comment body path must be a regular file');
  if (file.nlink > 1) throw new Error('Issue comment body file must not have multiple hard links');
  return canonicalFile;
}
// `-` reads stdin, so an agent whose scratch files live outside the worktree can pipe the text in.
export function readWorkspaceText(root, path) {
  return path === '-' ? readFileSync(0, 'utf8') : readFileSync(workspaceFilePath(root, path), 'utf8');
}
export function issueStatus(args, lanes) {
  const o = flags(args, ['--number', '--value']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1) throw new Error('Usage: issue status --number N --value STATUS');
  const cfg = writerConfig(); loadEnvironment(cfg); requireImplementer(cfg); boardStatus(cfg, n, (o['--value'] || '').toUpperCase());
}
export function issueSweepBoard(lanes) {
  const cfg = writerConfig(); loadEnvironment(cfg); requireImplementer(cfg);
  const moved = sweepBoard({ ...cfg, project: cachedGithubMetadata(cfg.repo).project });
  console.log(`Moved ${moved.length} closed issue card${moved.length === 1 ? '' : 's'} to Done${moved.length ? `: ${moved.map(n => `#${n}`).join(', ')}` : ''}.`);
}
// Issue writes stay in this repository or the workflow tooling repository, where skill improvements belong.
export function issueTargetRepo(cfg, requested) {
  if (!requested || requested === cfg.repo) return cfg.repo;
  const tooling = githubRepoFromRemote(cfg.toolingRepository);
  if (requested === tooling) return tooling;
  throw new Error(`Issue writes reach only ${cfg.repo} or the workflow tooling repository ${tooling}`);
}
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A private source may write to a public repository of the same owner, as long as the text does not name or link the source.
export function assertIssueVisibility(source, target, texts = []) {
  if (!source.private || target.private) return;
  const [sourceOwner, sourceName] = source.name.split('/');
  if (sourceOwner.toLowerCase() !== target.name.split('/')[0].toLowerCase()) throw new Error(`${target.name} is public and ${source.name} is private with a different owner; file in ${source.name} and link it instead`);
  const named = new RegExp(`(?<![\\w.-])(?:${escapeRegExp(source.name)}|${escapeRegExp(sourceName)})(?![\\w-])`, 'i');
  if (texts.some(text => named.test(text || ''))) throw new Error(`${target.name} is public and ${source.name} is private: remove the name ${sourceName} and any ${source.name} link from the title and body, and word the issue without project nouns`);
}
function issueWriteRepo(cfg, requested, texts = []) {
  const repo = issueTargetRepo(cfg, requested);
  if (repo !== cfg.repo) assertIssueVisibility({ name: cfg.repo, private: gh(['api', `repos/${cfg.repo}`]).private === true }, { name: repo, private: gh(['api', `repos/${repo}`]).private === true }, texts);
  return repo;
}
export function oldestExactTitle(issues, title) {
  return issues.filter(issue => issue.title === title).map(issue => issue.number).sort((a, b) => a - b)[0] ?? null;
}
// Open issues whose scope packet shares a path with `paths`: equal, or one lies under the other as the scope rule reads it.
export function scopeOverlaps(issues, paths) {
  if (!paths?.length) return [];
  const overlap = (a, b) => pathsWithinScope([a], [b]) || pathsWithinScope([b], [a]);
  return issues.filter(issue => (pathsFromIssueBody(issue.body || '') || []).some(path => paths.some(other => overlap(path, other))));
}
const STOP = new Set('the and for with that this when from into after before than then are was were not but has have had its into onto over under about'.split(' '));
const SCOPE_FENCE = /```scope[\s\S]*?```/g;
const words = text => new Set((text || '').replace(SCOPE_FENCE, ' ').toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)?.filter(word => !STOP.has(word)) ?? []);
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let shared = 0; for (const word of a) if (b.has(word)) shared++; return shared / (a.size + b.size - shared); };
const DUPLICATE_WINDOW_DAYS = 30;
// The same failing behaviour or outcome: the significant words of the two titles overlap by at least 60% (Jaccard), or those of title and body together by at least 50%.
function sameOutcome(candidate, title, body) {
  return jaccard(words(candidate.title), words(title)) >= 0.6 || jaccard(words(`${candidate.title} ${candidate.body}`), words(`${title} ${body}`)) >= 0.5;
}
// An existing match: open, or closed within the last 30 days; it shares a scope path and the same outcome. The oldest wins.
function findExistingMatch(issues, { title, body, now = Date.now() }) {
  const cutoff = now - DUPLICATE_WINDOW_DAYS * 86_400_000;
  const live = issues.filter(issue => issue.state !== 'CLOSED' || (issue.closedAt && Date.parse(issue.closedAt) >= cutoff));
  return scopeOverlaps(live, pathsFromIssueBody(body)).filter(issue => sameOutcome(issue, title, body)).sort((a, b) => a.number - b.number)[0] ?? null;
}
const positive = value => Number.isInteger(value) && value > 0;
// `--milestone NAME`, `--parent N` and `--blocked-by N[,M]`, validated before any write.
function structureOptions(o) {
  const parent = o['--parent'] === undefined ? null : Number(o['--parent']);
  if (parent !== null && !positive(parent)) throw new Error('--parent expects an issue number');
  const blockers = o['--blocked-by'] === undefined ? [] : o['--blocked-by'].split(',').map(value => Number(value.trim()));
  if (blockers.some(value => !positive(value))) throw new Error('--blocked-by expects issue numbers such as 12 or 12,13');
  return { milestone: o['--milestone'] || null, parent, blockers };
}
const NIT_SWEEP_MARKER = '<!-- workflow:nit-sweep -->';
const labelNames = labels => (labels || []).map(label => label.name ?? label);
// Backlogs have two levels: an epic whose children are stories or bugs. Null when the structure holds, else why it does not.
// The main-red bug belongs to no epic, so `issue create` asks it for no parent.
export const BASE_RED_MARKER = '<!-- workflow:base-red -->';
export const baseRedBody = body => body.includes(BASE_RED_MARKER);
export function backlogViolation({ number, labels, parent, parentLabels }) {
  const own = labelNames(labels);
  const retired = own.find(name => name === 'type:task' || name === 'type:chore');
  if (retired) return `${retired} is retired: file a type:story or type:bug under an epic`;
  const target = number ? `#${number}` : 'the issue';
  if (own.includes('type:epic') && parent) return `${target} is an epic and cannot sit under #${parent}: epics are never nested; file a sibling story or bug under the epic instead`;
  if (parent && !labelNames(parentLabels).includes('type:epic')) return `#${parent} is not a type:epic: ${target} must sit directly under one epic`;
  if (!number && !parent && (own.includes('type:story') || own.includes('type:bug'))) return 'a type:story or type:bug needs --parent N, the one epic it sits under';
  return null;
}
function requireBacklogStructure(repo, { number = null, labels, parent }) {
  const parentLabels = parent ? gh(['api', `repos/${repo}/issues/${parent}`]).labels : [];
  const problem = backlogViolation({ number, labels, parent, parentLabels });
  if (problem) throw new Error(problem);
}
function milestoneNumber(repo, name) {
  const found = gh(['api', '--paginate', '--slurp', `repos/${repo}/milestones?state=all&per_page=100`]).flat().find(milestone => milestone.title === name);
  if (!found) throw new Error(`${repo} has no milestone named ${name}`);
  return found.number;
}
// Adds the links the issue lacks, then reads them back from GitHub; a link already present is left alone.
function linkIssue(repo, n, { parent, blockers }) {
  if (parent === n || blockers.includes(n)) throw new Error(`#${n} cannot be its own parent or blocker`);
  const numbers = path => gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${path}?per_page=100`]).flat().map(issue => issue.number);
  const id = number => gh(['api', `repos/${repo}/issues/${number}`]).id;
  if (parent) {
    if (!numbers(`${parent}/sub_issues`).includes(n)) gh(['api', '--method', 'POST', `repos/${repo}/issues/${parent}/sub_issues`, '-F', `sub_issue_id=${id(n)}`]);
    if (!numbers(`${parent}/sub_issues`).includes(n)) throw new Error(`GitHub did not confirm #${n} under #${parent}`);
    console.log(`Linked #${n} under #${parent}`);
  }
  if (blockers.length) {
    const present = numbers(`${n}/dependencies/blocked_by`);
    for (const blocker of blockers.filter(number => !present.includes(number))) gh(['api', '--method', 'POST', `repos/${repo}/issues/${n}/dependencies/blocked_by`, '-F', `issue_id=${id(blocker)}`]);
    const after = numbers(`${n}/dependencies/blocked_by`);
    const missing = blockers.filter(number => !after.includes(number));
    if (missing.length) throw new Error(`GitHub did not confirm #${n} blocked by ${missing.map(number => `#${number}`).join(', ')}`);
    console.log(`Blocked #${n} by ${blockers.map(number => `#${number}`).join(', ')}`);
  }
}
export function issueCreate(args) {
  const unique = args.includes('--unique');
  const check = args.includes('--check');
  const o = flags(args.filter(arg => arg !== '--unique' && arg !== '--check'), ['--title', '--body-file', '--labels', '--repo', '--milestone', '--parent', '--blocked-by', '--distinct-from', '--reason']);
  const title = (o['--title'] || '').trim();
  const usage = 'Usage: issue create --title TITLE --body-file PATH [--labels A,B] [--repo OWNER/NAME] [--milestone NAME] [--parent N] [--blocked-by N,M] [--unique] [--check] [--distinct-from N --reason "<one line>"]. Before creating, any type of issue is matched against every open issue and those closed in the last 30 days: a match shares a scope path and the same failing behaviour or outcome (title words overlap 60%, or title and body words 50%). On a match nothing is created: the evidence is commented on it, a closed match is reopened (the fault is back), and `Exists: #N` is printed. --distinct-from N with --reason creates the issue anyway and records `Distinct from #N: <reason>` in its body.';
  if (!title || !o['--body-file']) throw new Error(usage);
  const distinct = o['--distinct-from'] === undefined ? null : Number(o['--distinct-from']);
  const reason = (o['--reason'] || '').trim();
  if ((distinct !== null || o['--reason'] !== undefined) && (!positive(distinct) || !reason || /[\r\n]/.test(reason))) throw new Error(usage);
  const structure = structureOptions(o);
  const root = git('rev-parse', '--show-toplevel');
  const read = validateIssueCommentBody(readWorkspaceText(root, o['--body-file']));
  const body = distinct ? `${read}\n\nDistinct from #${distinct}: ${reason}` : read;
  const cfg = writerConfig(); loadEnvironment(cfg);
  const repo = issueWriteRepo(cfg, o['--repo'], [title, body]);
  requireImplementer(cfg);
  const labels = (o['--labels'] || '').split(',').map(label => label.trim()).filter(Boolean);
  if (!check && body.includes(NIT_SWEEP_MARKER) && labels.includes('type:bug')) throw new Error('a Nit sweep is never a type:bug: file it as type:story');
  if (!check && !baseRedBody(body)) requireBacklogStructure(repo, { labels, parent: structure.parent });
  // List without --search: the search index lags new issues and would hide a concurrent duplicate.
  const open = () => gh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '1000', '--json', 'number,title,body']);
  return withRepoLock('issue-create', () => {
    const issues = unique || check ? open() : [];
    const existing = unique ? oldestExactTitle(issues, title) : null;
    if (existing) { console.log(`Exists: #${existing}`); return; }
    // Advisory only: `--check` lists the open issues sharing a scope path.
    if (check) {
      const overlaps = scopeOverlaps(issues, pathsFromIssueBody(body));
      console.log(overlaps.length ? overlaps.map(issue => `Overlaps: #${issue.number} ${issue.title}`).join('\n') : 'Overlaps: none');
    }
    if (check) return;
    if (!distinct) {
      // Two lists, never one `--state all` page: that returns only the newest N by creation date and hides an older open issue or one closed lately.
      const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
      const fields = 'number,title,body,state,closedAt';
      const all = [
        ...gh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '5000', '--json', fields]),
        ...gh(['issue', 'list', '--repo', repo, '--state', 'closed', '--search', `closed:>=${since}`, '--limit', '5000', '--json', fields]),
      ];
      const match = findExistingMatch(all, { title, body });
      if (match) {
        gh(['api', `repos/${repo}/issues/${match.number}/comments`, '-f', `body=New evidence from a repeated \`issue create\` (${title}):\n\n${body}`]);
        if (match.state === 'CLOSED') {
          gh(['api', '-X', 'PATCH', `repos/${repo}/issues/${match.number}`, '-f', 'state=open']);
          console.log(`Reopened: #${match.number}`);
        }
        console.log(`Exists: #${match.number}`); return;
      }
    }
    const milestone = structure.milestone ? milestoneNumber(repo, structure.milestone) : null;
    const created = gh(['api', `repos/${repo}/issues`, '-f', `title=${title}`, '-f', `body=${body}`, ...(milestone ? ['-F', `milestone=${milestone}`] : []), ...labels.flatMap(label => ['-f', `labels[]=${label}`])]);
    if (!Number.isSafeInteger(created.number)) throw new Error(`GitHub did not confirm the issue in ${repo}`);
    // Runs on other hosts do not share this lock; the oldest exact-title issue wins and a newer duplicate closes.
    const oldest = unique ? oldestExactTitle(open(), title) : null;
    if (oldest && oldest < created.number) {
      gh(['api', '-X', 'PATCH', `repos/${repo}/issues/${created.number}`, '-f', 'state=closed', '-f', 'state_reason=not_planned']);
      console.log(`Exists: #${oldest}`); return;
    }
    if (structure.milestone && created.milestone?.title !== structure.milestone) throw new Error(`GitHub did not confirm #${created.number} in milestone ${structure.milestone}`);
    console.log(`Created: #${created.number}`);
    linkIssue(repo, created.number, structure);
  });
}
// A `Measured:` result is one comment per issue: a rerun edits it, so the epic never collects a second measurement.
export function postIssueComment(repo, n, body, run = gh) {
  if (/^\s*Measured:/.test(body)) {
    const existing = run(['api', '--paginate', '--slurp', `repos/${repo}/issues/${n}/comments?per_page=100`]).flat().find(comment => /^\s*Measured:/.test(comment.body || ''));
    if (existing) {
      const edited = run(['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${existing.id}`, '-f', `body=${body}`]);
      if (!Number.isSafeInteger(edited.id)) throw new Error(`GitHub did not confirm the edit of the Measured: comment on #${n}`);
      return { id: edited.id, edited: true };
    }
  }
  const result = run(['api', `repos/${repo}/issues/${n}/comments`, '-f', `body=${body}`]);
  if (!Number.isSafeInteger(result.id)) throw new Error(`GitHub did not confirm the comment on #${n}`);
  return { id: result.id, edited: false };
}
export function issueComment(args) {
  const o = flags(args, ['--number', '--body-file', '--repo']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1 || !o['--body-file']) throw new Error('Usage: issue comment --number N --body-file PATH [--repo OWNER/NAME]');
  const root = git('rev-parse', '--show-toplevel');
  const body = validateIssueCommentBody(readWorkspaceText(root, o['--body-file']));
  const cfg = writerConfig(); loadEnvironment(cfg);
  const repo = issueWriteRepo(cfg, o['--repo'], [body]);
  requireImplementer(cfg);
  return withRepoLock(`issue-comment-${n}`, () => {
    const result = postIssueComment(repo, n, body);
    console.log(`${result.edited ? 'Edited the Measured: comment on' : 'Commented on'} #${n} (${result.id})`);
  });
}
export function issueEdit(args) {
  const o = flags(args, ['--number', '--body-file', '--repo', '--milestone', '--parent', '--blocked-by']);
  const n = Number(o['--number']);
  const structure = structureOptions(o);
  const usage = 'Usage: issue edit --number N [--body-file PATH] [--repo OWNER/NAME] [--milestone NAME] [--parent N] [--blocked-by N,M]';
  if (!positive(n) || !(o['--body-file'] || structure.milestone || structure.parent || structure.blockers.length)) throw new Error(usage);
  const root = git('rev-parse', '--show-toplevel');
  const body = o['--body-file'] ? validateIssueCommentBody(readWorkspaceText(root, o['--body-file'])) : null;
  const cfg = writerConfig(); loadEnvironment(cfg);
  const repo = issueWriteRepo(cfg, o['--repo'], [body]);
  requireImplementer(cfg);
  if (structure.parent) requireBacklogStructure(repo, { number: n, labels: gh(['api', `repos/${repo}/issues/${n}`]).labels, parent: structure.parent });
  return withRepoLock(`issue-edit-${n}`, () => {
    if (body !== null || structure.milestone) {
      const milestone = structure.milestone ? milestoneNumber(repo, structure.milestone) : null;
      const result = gh(['api', '-X', 'PATCH', `repos/${repo}/issues/${n}`, ...(body !== null ? ['-f', `body=${body}`] : []), ...(milestone ? ['-F', `milestone=${milestone}`] : [])]);
      if (body !== null && result.body !== body) throw new Error(`GitHub did not confirm #${n} edited`);
      if (structure.milestone && result.milestone?.title !== structure.milestone) throw new Error(`GitHub did not confirm #${n} in milestone ${structure.milestone}`);
    }
    console.log(`Edited #${n}`);
    linkIssue(repo, n, structure);
  });
}
export const closeFormsMessage = n => `Cannot close #${n} as completed: it has none of the three accepted forms. Add one, or close as not planned with --reason not_planned: (1) a closing PR merged into the base (Closes #${n}); (2) a <!-- workflow:consolidated-into N --> marker in its body, N being the issue that holds its outcome; (3) the statement "Make no repository changes." in its body.`;
// The one rule for closing as completed: an epic, a consolidated issue, a no-change issue or one with a merged closing PR.
export function completedCloseAllowed(issue, hasMergedClosingPr) {
  const isEpic = (issue.labels || []).some(label => (label.name ?? label) === 'type:epic');
  const folded = consolidatedInto(issue.body || '') !== null;
  const noChange = pathsFromIssueBody(issue.body || '')?.length === 0;
  return isEpic || folded || noChange || !!hasMergedClosingPr();
}
export function issueClose(args) {
  const o = flags(args, ['--number', '--reason']);
  const n = Number(o['--number']);
  const reason = o['--reason'] ?? 'completed';
  if (!Number.isInteger(n) || n < 1 || !['completed', 'not_planned'].includes(reason)) throw new Error('Usage: issue close --number N [--reason completed|not_planned]');
  const cfg = writerConfig(); loadEnvironment(cfg); requireImplementer(cfg);
  return withRepoLock(`issue-close-${n}`, () => {
    if (reason === 'completed') {
      const issue = gh(['api', `repos/${cfg.repo}/issues/${n}`]);
      if (!completedCloseAllowed(issue, () => mergedClosingPr(cfg.repo, n, cfg.base))) throw new Error(closeFormsMessage(n));
    }
    const result = gh(['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/${n}`, '-f', 'state=closed', ...(reason === 'not_planned' ? ['-f', 'state_reason=not_planned'] : [])]);
    if (result.state !== 'closed') throw new Error(`GitHub did not confirm #${n} closed`);
    console.log(`Closed #${n}`);
  });
}
function mergedClosingPr(repo, n, base) {
  const [owner, name] = repo.split('/');
  const query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){closedByPullRequestsReferences(first:100){nodes{merged baseRefName}}}}}';
  const found = gh(['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${n}`]);
  return (found.data?.repository?.issue?.closedByPullRequestsReferences?.nodes || []).some(pr => pr.merged && pr.baseRefName === base);
}
export function issueReopen(args) {
  const o = flags(args, ['--number']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1) throw new Error('Usage: issue reopen --number N');
  const cfg = writerConfig(); loadEnvironment(cfg); requireImplementer(cfg);
  return withRepoLock(`issue-reopen-${n}`, () => {
    const result = gh(['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/${n}`, '-f', 'state=open']);
    if (result.state !== 'open') throw new Error(`GitHub did not confirm #${n} open`);
    console.log(`Reopened #${n}`);
  });
}
export function labelsCommand(args) {
  if (args.length !== 1 || args[0] !== 'ensure') throw new Error('Usage: labels ensure');
  const { lanes } = config();
  if (!lanes.repo) throw new Error('Cannot infer a GitHub repository from origin');
  for (const name of ensureWorkflowLabels(lanes.repo)) console.log(`Created: ${name}`);
}

// Bug inflow for one repo over the last `days`: `type:bug` issues opened and closed in the window, the open count now,
// the median time to close of those closed in the window, and the closed-as-duplicate count (target 0).
const searchBugs = (read, repo, qualifiers, paginate = true) => read(['api', '--method', 'GET', ...(paginate ? ['--paginate', '--slurp'] : []), 'search/issues', '-f', `q=repo:${repo} is:issue label:"type:bug" ${qualifiers}`, '-f', `per_page=${paginate ? 100 : 1}`]);
const isDuplicate = issue => issue.state_reason === 'duplicate' || (issue.state_reason === 'not_planned' && consolidatedInto(issue.body || '') !== null);
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : null; };
const stamp = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
// The window is exactly `days` x 24 hours back from `now`, or starts at `sinceMs`; never a calendar day.
export function bugStats(repo, days, read = args => gh(args), now = Date.now(), sinceMs = null) {
  const since = stamp(sinceMs ?? now - days * 86_400_000);
  const items = qualifiers => searchBugs(read, repo, qualifiers).flatMap(page => page.items || []);
  const opened = items(`created:>=${since}`);
  const closed = items(`is:closed closed:>=${since}`);
  const open = searchBugs(read, repo, 'is:open', false).total_count;
  return {
    repo, days, since, until: stamp(now), opened: opened.length, closed: closed.length, open,
    medianMs: median(closed.map(issue => Date.parse(issue.closed_at) - Date.parse(issue.created_at))),
    duplicates: closed.filter(isDuplicate).length,
  };
}
const duration = ms => {
  if (ms === null) return 'n/a';
  const hours = ms / 3_600_000;
  const [value, unit] = hours < 24 ? [hours, 'h'] : [hours / 24, 'd'];
  return `${Number(value.toFixed(1))}${unit}`;
};
const bugNumbers = stats => `opened ${stats.opened}, closed ${stats.closed}, open ${stats.open}, median time to close ${duration(stats.medianMs)}, duplicates ${stats.duplicates} (target 0)`;
export const bugsLine = stats => `Bugs (${stats.days}d): ${bugNumbers(stats)}`;
export function bugsCommand(args, lanes, read, now) {
  const usage = 'Usage: bugs [--days N | --since ISO-TIMESTAMP] [--repo OWNER/NAME]';
  let o;
  try { o = flags(args, ['--days', '--repo', '--since']); } catch { throw new Error(usage); }
  const sinceMs = o['--since'] === undefined ? null : Date.parse(o['--since']);
  if (o['--since'] !== undefined && (o['--days'] !== undefined || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(o['--since']) || !Number.isFinite(sinceMs))) throw new Error(usage);
  const days = o['--days'] === undefined ? 14 : Number(o['--days']);
  const repo = o['--repo'] ?? lanes.repo;
  if (!Number.isInteger(days) || days < 1 || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error(usage);
  const stats = bugStats(repo, days, read, now, sinceMs);
  console.log(`${repo} (${sinceMs === null ? `${days}d` : `since ${stats.since}`}): ${bugNumbers(stats)}; window ${stats.since} to ${stats.until}`);
}
