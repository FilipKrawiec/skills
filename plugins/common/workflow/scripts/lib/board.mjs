import { gh, githubMetadataPath, jsonCommand, missingProjectScope, readThroughLocalCache, run, workflowDefaults } from './core.mjs';
import { sharedRead } from './quota.mjs';

// Issue and PR facts `drive`, `status`, `pr` and the issue commands read from GitHub, and the board's Status column.

// The issue's fenced `scope` JSON packet; an invalid packet is treated as absent.
function scopePacket(body) {
  const scope = /```scope[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(body);
  try { return scope ? JSON.parse(scope[1]) : null; } catch { return null; }
}
// The no-change statement counts only as a declaration: its own sentence or line outside code and quotes, so an issue
// that merely mentions it keeps its scope.
function declaresNoChange(body) {
  const bare = body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/"[^"\n]*"|\u201c[^\u201d\n]*\u201d/g, ' ');
  return /(?:^|[.!?]\s+)(?:[-*>]\s+)?(?:make\s+no|do\s+not\s+make(?:\s+any)?)\s+(?:repository|repo)\s+(?:changes|files|commits)\b(?=\s*(?:[.,;]|$))/im.test(bare);
}
export function pathsFromIssueBody(body = '') {
  if (declaresNoChange(body)) return [];
  const parsed = scopePacket(body)?.paths;
  if (Array.isArray(parsed) && parsed.length && parsed.every(value => typeof value === 'string' && value.trim() && value.trim() !== '.')) return parsed.map(value => value.startsWith('./') ? value.slice(2) : value.replace(/^\//, ''));
  return null;
}
// The issue or PR numbers the scope packet lists as `dependencies` (`12` or `"#12"`).
export function dependenciesFromIssueBody(body = '') {
  const listed = scopePacket(body)?.dependencies;
  if (!Array.isArray(listed)) return [];
  return [...new Set(listed.map(value => Number(String(value).replace(/^#/, ''))).filter(n => Number.isInteger(n) && n > 0))];
}
export function pathsWithinScope(paths, scope) {
  if (!Array.isArray(paths)) return false;
  if (scope === null) return true;
  if (!Array.isArray(scope)) return false;
  return paths.every(path => scope.some(value => {
    const root = value.replace(/^\.\//, '').replace(/\/+$/, '');
    return root && (path === root || path.startsWith(`${root}/`));
  }));
}
function workflowLogins(cfg) { return new Set([cfg.implementer, cfg.reviewer].filter(Boolean).map(login => login.toLowerCase())); }
// A review carrying the `agent-review` marker is a verdict; an unmarked COMMENTED review from a workflow identity is a
// thread reply; any other review is someone's input.
function reviewKind(review, cfg) {
  if (/<!-- agent-review\b/.test(review.body || '')) return 'verdict';
  return review.state === 'COMMENTED' && workflowLogins(cfg).has(review.author?.login?.toLowerCase()) ? 'reply' : 'other';
}
// Approves on the newest Reviewer verdict; thread replies never decide. A Reviewer change request at the head blocks
// whether marked or not, so that check reads the review state rather than its kind.
export function reviewerApproved(pr, cfg) {
  const mine = (pr.reviews || []).filter(review => review.author?.login?.toLowerCase() === cfg.reviewer.toLowerCase());
  const latest = mine.filter(review => reviewKind(review, cfg) === 'verdict').at(-1); const head = pr.headRefOid;
  const ownerLane = pr.labels?.some(label => label.name === 'review:owner');
  return Boolean(latest?.state === 'APPROVED' && latest.commit?.oid === head && latest.body.includes(`sha=${head}`) && latest.body.includes(`verdict=${ownerLane ? 'owner' : 'ready'}`) &&
    !mine.some(review => review.state === 'CHANGES_REQUESTED' && review.commit?.oid === head));
}
// A PR delivers the issues GitHub records it closing in this repository, those its body closes by keyword (a stacked
// PR's base is not the default branch, so GitHub records no closing link for it) and those a line starting
// `Part of #N` names: a slice PR gets no closing link, yet it delivers its issue. A bare mention links nothing.
export function prLinkedIssues(pr, repo) {
  const closes = (pr.closingIssuesReferences || []).filter(issue => `${issue.repository?.owner?.login}/${issue.repository?.name}`.toLowerCase() === repo.toLowerCase()).map(issue => issue.number);
  const keywords = [...(pr.body || '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):? #(\d+)\b/gi)].map(match => Number(match[1]));
  const parts = [...(pr.body || '').matchAll(/^\s*Part of #(\d+)\b/gim)].map(match => Number(match[1]));
  return [...new Set([...closes, ...keywords, ...parts])];
}
export function prRecord(pr, cfg) {
  const issues = prLinkedIssues(pr, cfg.repo);
  const reviews = pr.reviews || [];
  const mine = reviews.filter(review => review.author?.login?.toLowerCase() === cfg.reviewer.toLowerCase());
  const head = pr.headRefOid;
  const approved = reviewerApproved(pr, cfg);
  const ownerMine = reviews.filter(review => review.author?.login?.toLowerCase() === cfg.owner?.toLowerCase()).at(-1);
  const ownerApproved = Boolean(cfg.owner && ownerMine?.state === 'APPROVED' && ownerMine.commit?.oid === head);
  const verdictOf = review => /<!-- agent-review\b[^>]*\bverdict=(\w+)/.exec(review?.body || '')?.[1] || null;
  // A dismissed review (say, after the merge base changed) no longer reviews the head, so the PR awaits a fresh verdict.
  // Once a PR is ready, an unapproved `ready` verdict at its head was the hand-off, so the PR awaits the Reviewer's approval.
  // Older markers carry `mode=author`, which counts the same way; a marker without a mode is the one review mode.
  const handOff = review => review.state !== 'APPROVED' && (verdictOf(review) === 'ready' || /<!-- agent-review\b[^>]*\bmode=author\b/.test(review.body || ''));
  const atHead = mine.filter(review => review.commit?.oid === head && review.state !== 'DISMISSED' && !(!pr.isDraft && handOff(review)));
  const latestVerdict = atHead.filter(review => verdictOf(review)).at(-1);
  const workflow = workflowLogins(cfg);
  // Someone outside the workflow whose newest review at the head requests changes holds the PR, even under the Reviewer's approval.
  const outsideLatest = new Map();
  for (const review of reviews) {
    const login = review.author?.login?.toLowerCase();
    if (login && !workflow.has(login) && review.commit?.oid === head && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) outsideLatest.set(login, review.state);
  }
  const outsideChanges = [...outsideLatest.values()].includes('CHANGES_REQUESTED');
  const checks = pr.statusCheckRollup || [];
  const failed = checks.some(check => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes((check.conclusion || check.state || '').toUpperCase()));
  const broken = pr.mergeable === 'CONFLICTING' || failed;
  // A red check, a conflict or someone's change request comes before the hand-off; pending checks are waited on.
  const shipReady = Boolean(pr.isDraft && !broken && !outsideChanges && (verdictOf(latestVerdict) === 'ready' || (verdictOf(latestVerdict) === 'owner' && approved)));
  return { ...pr, issues, approved, ownerApproved, awaitingReview: atHead.length === 0, shipReady };
}
// The board's project id, Status field id and option ids (by lower-case name), from the cached GitHub metadata. A miss,
// a stale entry or a cached board of another project number reads GitHub once and caches the result.
export function boardMetadata(cfg, project = cfg.project, refresh = false) {
  const load = () => {
    const info = jsonCommand('gh', ['project', 'view', String(project.number), '--owner', project.owner, '--format', 'json']);
    if (project.title && info.title !== project.title) throw new Error('Cached GitHub Project no longer matches; run `workflow.mjs cache refresh`');
    if (typeof info.id !== 'string' || !info.id) throw new Error('GitHub Project response is missing its id');
    const field = gh(['project', 'field-list', String(project.number), '--owner', project.owner, '--format', 'json']).fields.find(item => item.name === 'Status');
    return { board: { number: project.number, projectId: info.id, statusFieldId: field?.id, options: Object.fromEntries((field?.options || []).map(item => [item.name.toLowerCase(), item.id])) } };
  };
  const read = force => readThroughLocalCache(githubMetadataPath(), cfg.repo, load, { ttlMs: workflowDefaults.github.metadataCacheHours * 3_600_000, refresh: force, expectedFields: ['board'] }).board;
  const cached = read(refresh);
  return cached.number === project.number && cached.statusFieldId ? cached : read(true);
}
// Moves an issue's card to a Status column; a closed issue always goes to Done. `silent` skips a missing board, card or
// option and a token without project scope instead of failing.
export function boardStatus(cfg, issue, value, silent = false) {
  const statusNames = { BACKLOG: 'Backlog', TODO: 'Todo', PROGRESS: 'In progress', BLOCKED: 'Blocked', REVIEW: 'Review', DONE: 'Done' };
  const target = statusNames[value];
  const project = cfg.project;
  if (!target || !project?.number) {
    if (silent) return false;
    if (!target) throw new Error(`Unknown status ${value || '(none)'}; use one of: ${Object.keys(statusNames).join(', ')}`);
    if (project === false) { console.log('Repository has no GitHub Project board; status skipped (use priority labels).'); return false; }
    if (Array.isArray(project?.ambiguous)) throw new Error(`GitHub Project board is ambiguous: boards ${project.ambiguous.map(n => `#${n}`).join(', ')} tie for this repository's open issues; put more issues on one board, then run \`workflow.mjs cache refresh\``);
    throw new Error('No GitHub Project was discovered; check scopes or run `workflow.mjs cache refresh`');
  }
  try {
    const owner = project.owner;
    if (!owner) throw new Error('Cached GitHub Project is missing its owner; run `workflow.mjs cache refresh`');
    const meta = boardMetadata(cfg, project);
    const id = meta.projectId;
    const [org, name] = cfg.repo.split('/');
    const query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){state projectItems(first:30){nodes{id project{id}}}}}}';
    const issueData = gh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${org}`, '-F', `name=${name}`, '-F', `number=${issue}`]).data.repository.issue;
    let card = issueData?.projectItems?.nodes?.find(item => item.project.id === id);
    if (!card && silent) return false;
    if (!card) {
      const url = `https://github.com/${cfg.repo}/issues/${issue}`;
      card = { id: run('gh', ['project', 'item-add', String(project.number), '--owner', owner, '--url', url, '--format', 'json', '--jq', '.id']) };
    }
    const final = issueData.state === 'CLOSED' ? 'Done' : target;
    let option = meta.options[final.toLowerCase()];
    // A missing option may mean the board changed since the metadata was cached; read it once more before giving up.
    const current = option ? meta : boardMetadata(cfg, project, true);
    option ??= current.options[final.toLowerCase()];
    if (!option) {
      if (silent) return false;
      throw new Error(`Project is missing Status option ${final}`);
    }
    run('gh', ['project', 'item-edit', '--project-id', id, '--id', card.id, '--field-id', current.statusFieldId, '--single-select-option-id', option]);
    if (!silent) console.log(`#${issue} → ${final}`);
  } catch (error) {
    if (!silent || !missingProjectScope(error)) throw error;
    console.error(`Board status for #${issue} not updated: token lacks project scope; continuing.`);
    return false;
  }
}
// Moves every card the board query returned (closed issue, Status not Done) to Done; the state and status are checked
// again here, so a board that ignores the filter moves nothing it should not. `io` reads the cards ({ number, state,
// status }) and moves one; it returns the moved issue numbers.
export function sweepClosedCards(io) {
  const moved = [];
  for (const card of io.cards()) {
    if (card.state !== 'CLOSED' || String(card.status || '').toLowerCase() === 'done') continue;
    if (io.moveToDone(card.number) !== false) moved.push(card.number);
  }
  return moved;
}
// One filtered query on the project's items: only closed cards not in Done, each with its id, Status and issue.
const sweepQuery = 'query($owner:String!,$number:Int!,$q:String!,$after:String){rateLimit{cost} repositoryOwner(login:$owner){... on ProjectV2Owner{projectV2(number:$number){items(first:100,after:$after,query:$q){pageInfo{hasNextPage endCursor} nodes{id status:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} content{... on Issue{number state repository{nameWithOwner}}}}}}}}}';
export function githubBoardSweepIo(cfg) {
  const { project } = cfg;
  return {
    cards: () => {
      const cards = []; let after;
      for (let page = 0; page < 2; page++) {
        const args = ['api', 'graphql', '-f', `query=${sweepQuery}`, '-F', `owner=${project.owner}`, '-F', `number=${project.number}`, '-f', 'q=is:closed -status:Done'];
        if (after) args.push('-F', `after=${after}`);
        const items = gh(args).data.repositoryOwner?.projectV2?.items;
        if (!items) break;
        for (const item of items.nodes) {
          const issue = item.content;
          if (issue?.number && issue.repository?.nameWithOwner === cfg.repo) cards.push({ number: issue.number, state: issue.state, status: item.status?.name });
        }
        if (!items.pageInfo.hasNextPage) break;
        after = items.pageInfo.endCursor;
      }
      return cards;
    },
    moveToDone: number => boardStatus(cfg, number, 'DONE', true),
  };
}
export const sweepWindowMs = 600_000;
// The moved issue numbers; a repository with no usable board sweeps nothing. At most one sweep per repository per
// window on a machine (shared across processes) when `windowed`; a call inside it returns [] without touching GitHub.
export function sweepBoard(cfg, { windowed = false, read = sharedRead } = {}) {
  if (!cfg.project?.number || !cfg.project.owner) return [];
  const sweep = () => sweepClosedCards(githubBoardSweepIo(cfg));
  if (!windowed) return sweep();
  let moved = [];
  read(`sweep:${cfg.repo}`, sweepWindowMs, () => { moved = sweep(); return true; });
  return moved;
}
