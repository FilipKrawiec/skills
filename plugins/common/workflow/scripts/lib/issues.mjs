import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  afkComments,
  afkPathsFromIssueBody,
  afkPathsWithinScope,
  afkReadLedger,
} from './afk-board.mjs';
import {
  afkActor,
  afkCheckRetroMode,
  afkConfig,
  afkFlags,
  afkLive,
  afkLoadEnvironment,
  afkQueue,
  afkStatus,
} from './afk-runs.mjs';
import {
  afkGh,
  afkMarker,
  config,
  ensureWorkflowLabels,
  git,
  githubRepoFromRemote,
  run,
  withRepoLock,
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
export function issueClaim(args, lanes) {
  const o = afkFlags(args, ['--number', '--run', '--note']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1 || !/^[\w.-]+$/.test(o['--run'] || '')) throw new Error('Usage: issue claim --number N --run ID [--note TEXT]');
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
  const marker = /<!-- afk-claim session=(\S+) -->/;
  return withRepoLock(`claim-${n}`, () => {
    const current = afkComments(cfg, n).map(c => marker.exec(c.body || '')?.[1]).filter(Boolean).at(-1);
    const live = afkLive(cfg);
    if (current && current !== o['--run'] && live.includes(current)) throw new Error(`#${n} is claimed by live run ${current}`);
    const created = afkGh(['api', `repos/${cfg.repo}/issues/${n}/comments`, '-f', `body=${afkMarker('claim', o['--run'])}\nClaimed by ${o['--run']}.${o['--note'] ? ` ${o['--note']}` : ''}`]);
    const newest = afkComments(cfg, n).map(c => marker.exec(c.body || '')?.[1]).filter(Boolean).at(-1);
    if (newest !== o['--run']) {
      run('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${created.id}`, '-f', `body=<!-- afk-claim-raced session=${o['--run']} -->`]);
      throw new Error(`Claim race on #${n}; current claim is ${newest || 'unknown'}`);
    }
    console.log(`Claimed #${n} for ${o['--run']}`);
  });
}
export function issueStatus(args, lanes) {
  const o = afkFlags(args, ['--number', '--value']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1) throw new Error('Usage: issue status --number N --value STATUS');
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg); afkStatus(cfg, n, (o['--value'] || '').toUpperCase());
}
// Issue writes stay in this repository or the workflow tooling repository, where skill improvements belong.
export function issueTargetRepo(cfg, requested) {
  if (!requested || requested === cfg.repo) return cfg.repo;
  const tooling = githubRepoFromRemote(cfg.toolingRepository);
  if (requested === tooling) return tooling;
  throw new Error(`Issue writes reach only ${cfg.repo} or the workflow tooling repository ${tooling}`);
}
export function assertIssueVisibility(source, target) {
  if (source.private && !target.private) throw new Error(`${target.name} is public and ${source.name} is private; file in ${source.name} and link it instead`);
}
function issueWriteRepo(cfg, requested) {
  const repo = issueTargetRepo(cfg, requested);
  if (repo !== cfg.repo) assertIssueVisibility({ name: cfg.repo, private: afkGh(['api', `repos/${cfg.repo}`]).private === true }, { name: repo, private: afkGh(['api', `repos/${repo}`]).private === true });
  return repo;
}
export function oldestExactTitle(issues, title) {
  return issues.filter(issue => issue.title === title).map(issue => issue.number).sort((a, b) => a - b)[0] ?? null;
}
// `afk.retros: "bugs-when-empty"` pauses retro filing while the target repository has open work other than the run's own
// issue and owner items, then accepts only bugs, so retros cannot refill a backlog as fast as runs drain it.
export function afkRetroRefusal(mode, open, labels, held) {
  if ((mode ?? 'all') === 'all') return null;
  const work = open.filter(issue => issue.number !== held && !(issue.labels || []).some(label => (label.name ?? label) === 'lane:owner'));
  if (work.length) return `Retro filing is paused until the backlog is empty (${work.length} open issues); file nothing`;
  return labels.includes('type:bug') ? null : 'Retro filing takes only type:bug while the backlog is empty; file nothing else';
}
// Another repository's own setting governs retros filed into it; only a missing config keeps the default, any other failure files nothing.
function afkRetroMode(cfg, repo) {
  if (repo === cfg.repo) return cfg.retros;
  const result = spawnSync('gh', ['api', `repos/${repo}/contents/.agents/config.json`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (!result.error && result.status !== 0 && /HTTP 404/.test(result.stderr || '')) return undefined;
  if (result.error || result.status !== 0) throw new Error(`Cannot read ${repo} afk.retros; file no retro until it is readable`);
  return afkCheckRetroMode(JSON.parse(Buffer.from(JSON.parse(result.stdout).content, 'base64').toString('utf8')).afk?.retros);
}
// The run's own issue: the watcher binds it in WORKFLOW_ISSUE_NUMBER; a self-started run records it only in its hold.
function afkRetroHeld(root) {
  if (process.env.WORKFLOW_ISSUE_NUMBER) return Number(process.env.WORKFLOW_ISSUE_NUMBER);
  const runId = process.env.WORKFLOW_RUN_ID;
  if (!runId) return null;
  const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
  return afkReadLedger(join(common, 'afk-holds.json'))[runId]?.[0]?.number ?? null;
}
// Open issues whose scope packet shares a path with `paths`: equal, or one lies under the other as the scope rule reads it.
export function scopeOverlaps(issues, paths) {
  if (!paths?.length) return [];
  const overlap = (a, b) => afkPathsWithinScope([a], [b]) || afkPathsWithinScope([b], [a]);
  return issues.filter(issue => (afkPathsFromIssueBody(issue.body || '') || []).some(path => paths.some(other => overlap(path, other))));
}
export function issueCreate(args) {
  const unique = args.includes('--unique'), retro = args.includes('--retro');
  const check = args.includes('--check');
  const o = afkFlags(args.filter(arg => arg !== '--unique' && arg !== '--check' && arg !== '--retro'), ['--title', '--body-file', '--labels', '--repo']);
  const title = (o['--title'] || '').trim();
  if (!title || !o['--body-file']) throw new Error('Usage: issue create --title TITLE --body-file PATH [--labels A,B] [--repo OWNER/NAME] [--unique] [--check] [--retro]');
  const root = git('rev-parse', '--show-toplevel');
  const body = validateIssueCommentBody(readWorkspaceText(root, o['--body-file']));
  const cfg = afkConfig(); afkLoadEnvironment(cfg);
  const repo = issueWriteRepo(cfg, o['--repo']);
  afkActor(cfg);
  const labels = (o['--labels'] || '').split(',').map(label => label.trim()).filter(Boolean);
  // List without --search: the search index lags new issues and would hide a concurrent duplicate.
  const open = () => afkGh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '1000', '--json', retro ? 'number,title,body,labels' : 'number,title,body']);
  const followUp = labels.includes('type:bug') || labels.includes('type:chore');
  return withRepoLock('issue-create', () => {
    const issues = unique || followUp || check || retro ? open() : [];
    if (retro) {
      const held = repo === cfg.repo ? afkRetroHeld(root) : null;
      const refusal = afkRetroRefusal(afkRetroMode(cfg, repo), issues, labels, held);
      if (refusal) { console.log(`Skipped: ${refusal}`); return; }
    }
    const existing = unique ? oldestExactTitle(issues, title) : null;
    if (existing) { console.log(`Exists: #${existing}`); return; }
    // Advisory: a follow-up sharing a scope path with an open issue usually belongs on that issue as a comment.
    if (followUp || check) {
      const overlaps = scopeOverlaps(issues, afkPathsFromIssueBody(body));
      console.log(overlaps.length ? overlaps.map(issue => `Overlaps: #${issue.number} ${issue.title}`).join('\n') : 'Overlaps: none');
    }
    if (check) return;
    const created = afkGh(['api', `repos/${repo}/issues`, '-f', `title=${title}`, '-f', `body=${body}`, ...labels.flatMap(label => ['-f', `labels[]=${label}`])]);
    if (!Number.isSafeInteger(created.number)) throw new Error(`GitHub did not confirm the issue in ${repo}`);
    // Runs on other hosts do not share this lock; the oldest exact-title issue wins and a newer duplicate closes.
    const oldest = unique ? oldestExactTitle(open(), title) : null;
    if (oldest && oldest < created.number) {
      afkGh(['api', '-X', 'PATCH', `repos/${repo}/issues/${created.number}`, '-f', 'state=closed', '-f', 'state_reason=not_planned']);
      console.log(`Exists: #${oldest}`); return;
    }
    console.log(`Created: #${created.number}`);
  });
}
export function issueComment(args) {
  const o = afkFlags(args, ['--number', '--body-file', '--repo']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1 || !o['--body-file']) throw new Error('Usage: issue comment --number N --body-file PATH [--repo OWNER/NAME]');
  const root = git('rev-parse', '--show-toplevel');
  const body = validateIssueCommentBody(readWorkspaceText(root, o['--body-file']));
  const cfg = afkConfig(); afkLoadEnvironment(cfg);
  const repo = issueWriteRepo(cfg, o['--repo']);
  afkActor(cfg);
  return withRepoLock(`issue-comment-${n}`, () => {
    const result = afkGh(['api', `repos/${repo}/issues/${n}/comments`, '-f', `body=${body}`]);
    if (!Number.isSafeInteger(result.id)) throw new Error(`GitHub did not confirm the comment on #${n}`);
    console.log(`Commented on #${n} (${result.id})`);
  });
}
export function issueEdit(args) {
  const o = afkFlags(args, ['--number', '--body-file']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1 || !o['--body-file']) throw new Error('Usage: issue edit --number N --body-file PATH');
  const root = git('rev-parse', '--show-toplevel');
  const body = validateIssueCommentBody(readWorkspaceText(root, o['--body-file']));
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
  return withRepoLock(`issue-edit-${n}`, () => {
    const result = afkGh(['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/${n}`, '-f', `body=${body}`]);
    if (result.body !== body) throw new Error(`GitHub did not confirm #${n} edited`);
    console.log(`Edited #${n}`);
  });
}
export function issueClose(args) {
  const o = afkFlags(args, ['--number']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1) throw new Error('Usage: issue close --number N');
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
  return withRepoLock(`issue-close-${n}`, () => {
    const result = afkGh(['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/${n}`, '-f', 'state=closed']);
    if (result.state !== 'closed') throw new Error(`GitHub did not confirm #${n} closed`);
    console.log(`Closed #${n}`);
  });
}
export function issueReopen(args) {
  const o = afkFlags(args, ['--number']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1) throw new Error('Usage: issue reopen --number N');
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
  return withRepoLock(`issue-reopen-${n}`, () => {
    const result = afkGh(['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/${n}`, '-f', 'state=open']);
    if (result.state !== 'open') throw new Error(`GitHub did not confirm #${n} open`);
    console.log(`Reopened #${n}`);
  });
}
export function issueQueue(args, lanes) { afkQueue(args); }
export function labelsCommand(args) {
  if (args.length !== 1 || args[0] !== 'ensure') throw new Error('Usage: labels ensure');
  const { lanes } = config();
  if (!lanes.repo) throw new Error('Cannot infer a GitHub repository from origin');
  for (const name of ensureWorkflowLabels(lanes.repo)) console.log(`Created: ${name}`);
}
