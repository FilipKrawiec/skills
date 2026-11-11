import { gh, jsonCommand, missingProjectScope, run } from './core.mjs';

// Issue and PR facts `drive`, `status`, `pr` and the issue commands read from GitHub, and the board's Status column.
export function issueComments(cfg, issue) { return gh(['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${issue}/comments`]).flat(); }
// The issue's fenced `scope` JSON packet; an invalid packet is treated as absent.
function scopePacket(body) {
  const scope = /```scope[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(body);
  try { return scope ? JSON.parse(scope[1]) : null; } catch { return null; }
}
export function pathsFromIssueBody(body = '') {
  if (/\b(?:make\s+no|do\s+not\s+make(?:\s+any)?)\s+(?:repository|repo)\s+(?:changes|files|commits)\b/i.test(body)) return [];
  const parsed = scopePacket(body)?.paths;
  if (Array.isArray(parsed) && parsed.length && parsed.every(value => typeof value === 'string' && value.trim() && value.trim() !== '.')) return parsed.map(value => value.startsWith('./') ? value.slice(2) : value.replace(/^\//, ''));
  return null;
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
// A PR delivers the issues GitHub records it closing in this repository, and those a line starting `Part of #N` names:
// a slice PR gets no closing link, yet it delivers its issue. A bare mention links nothing.
export function prLinkedIssues(pr, repo) {
  const closes = (pr.closingIssuesReferences || []).filter(issue => `${issue.repository?.owner?.login}/${issue.repository?.name}`.toLowerCase() === repo.toLowerCase()).map(issue => issue.number);
  const parts = [...(pr.body || '').matchAll(/^\s*Part of #(\d+)\b/gim)].map(match => Number(match[1]));
  return [...new Set([...closes, ...parts])];
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
  const shipReady = Boolean(pr.isDraft && !broken && !outsideChanges && verdictOf(latestVerdict) === 'ready');
  return { ...pr, issues, approved, ownerApproved, awaitingReview: atHead.length === 0, shipReady };
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
    const projectInfo = jsonCommand('gh', ['project', 'view', String(project.number), '--owner', owner, '--format', 'json']);
    if (project.title && projectInfo.title !== project.title) throw new Error('Cached GitHub Project no longer matches; run `workflow.mjs cache refresh`');
    const id = projectInfo.id;
    if (typeof id !== 'string' || !id) throw new Error('GitHub Project response is missing its id');
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
    const field = gh(['project', 'field-list', String(project.number), '--owner', owner, '--format', 'json']).fields.find(item => item.name === 'Status');
    const option = field?.options.find(item => item.name.toLowerCase() === final.toLowerCase());
    if (!option) {
      if (silent) return false;
      throw new Error(`Project is missing Status option ${final}`);
    }
    run('gh', ['project', 'item-edit', '--project-id', id, '--id', card.id, '--field-id', field.id, '--single-select-option-id', option.id]);
    if (!silent) console.log(`#${issue} → ${final}`);
  } catch (error) {
    if (!silent || !missingProjectScope(error)) throw error;
    console.error(`Board status for #${issue} not updated: token lacks project scope; continuing.`);
    return false;
  }
}
