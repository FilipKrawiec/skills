import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  assertDistinctPushRoles,
  cleanEnvironment,
  config,
  git,
  gitFailureLine,
  githubPushRemoteMatches,
  jsonCommand,
  parseRepo,
  requireLinkedWorktree,
  run,
} from './core.mjs';
import { readWorkspaceText } from './issues.mjs';

// Commits carry the implementer's GitHub identity, never the machine's Git user, so the owner can approve them.
function implementerCommitIdentity(root) {
  const login = config().lanes.implementer;
  if (typeof login !== 'string' || !/^[A-Za-z0-9-]+$/.test(login)) throw new Error('Configure identities.implementer before committing');
  const env = cleanEnvironment();
  const token = run('gh', ['auth', 'token', '--hostname', 'github.com', '--user', login], { cwd: root, env });
  if (!token || /\s/.test(token)) throw new Error('No usable implementer credential');
  const id = jsonCommand('gh', ['api', '--hostname', 'github.com', `users/${login}`], { cwd: root, env: { ...env, GH_TOKEN: token } }).id;
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Cannot resolve the implementer GitHub account');
  const email = `${id}+${login}@users.noreply.github.com`;
  return { GIT_AUTHOR_NAME: login, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: login, GIT_COMMITTER_EMAIL: email };
}
export function commit(args) {
  if (args[0] !== '--message' || !(args.length === 2 || (args.length >= 4 && args[2] === '--'))) throw new Error('Usage: commit --message MESSAGE [-- PATH...]');
  const message = args[1];
  const paths = args.slice(3);
  if (!/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-zA-Z0-9._/-]+\))?!?: [^\r\n]+$/.test(message.split('\n')[0].replace(/\r$/, ''))) throw new Error('Commit message subject (first line) must be a Conventional Commit');
  if (paths.some(path => !path || path === '.' || path.startsWith('/') || path.startsWith(':') || path.split('/').includes('..'))) throw new Error('Provide explicit repository-relative paths');
  const root = requireLinkedWorktree();
  if (realpathSync(process.cwd()) !== realpathSync(root)) throw new Error('Run commit from the repository root');
  const merging = spawnSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: root, env: cleanEnvironment() }).status === 0;
  if (!merging && !paths.length) throw new Error('Usage: commit --message MESSAGE [-- PATH...]; paths are optional only while a merge is in progress');
  const env = { ...cleanEnvironment(), ...implementerCommitIdentity(root) };
  // A merge commit records the whole merged index; the listed paths are the resolved conflicts.
  const staged = spawnSync('git', ['diff', '--cached', '--quiet', '--'], { cwd: root, env });
  if (!merging && (staged.error || staged.status !== 0)) throw new Error('Existing staged changes or an unreadable index; preserve them and commit separately');
  if (paths.length) {
    const add = spawnSync('git', ['--literal-pathspecs', 'add', '--', ...paths], { cwd: root, env, encoding: 'utf8' });
    if (add.error || add.status !== 0) throw new Error('Could not stage selected paths; inspect repository status');
  }
  // Conflicts the listed paths did not stage stay unmerged; git would refuse them with a message this command hides.
  if (merging) {
    const unmerged = spawnSync('git', ['diff', '--name-only', '--diff-filter=U', '-z', '--'], { cwd: root, env, encoding: 'utf8' });
    const conflicted = unmerged.status === 0 ? [...new Set(unmerged.stdout.split('\0').filter(Boolean))] : [];
    if (conflicted.length) throw new Error(`Unmerged paths remain: ${conflicted.join(', ')}; pass each resolved path after --`);
  }
  const result = spawnSync('git', merging ? ['commit', '-m', message] : ['--literal-pathspecs', 'commit', '--only', '-m', message, '--', ...paths], { cwd: root, env, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    const reason = gitFailureLine(result.stderr || result.stdout || result.error?.message || '');
    throw new Error(`Commit failed${reason ? `: ${reason}` : ''}; selected paths remain staged for inspection`);
  }
  console.log(JSON.stringify({ result: 'committed', head: git('rev-parse', 'HEAD') }));
}
// The fetched branch tip was once in this checkout's history but the pushed head dropped it: a rebase or amend, not a moved remote.
// Reads only local refs and the HEAD reflog, so diagnosing needs no credentialed remote call.
function pushRewroteHistory(branch, head) {
  const local = (...args) => spawnSync('git', args, { encoding: 'utf8', env: cleanEnvironment() });
  const tracked = local('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}^{commit}`);
  if (tracked.status !== 0) return false;
  const tip = tracked.stdout.trim();
  if (local('merge-base', '--is-ancestor', tip, head).status === 0) return false;
  const reflog = local('reflog', 'show', '--format=%H', 'HEAD');
  if (reflog.status !== 0) return false;
  return [...new Set(reflog.stdout.split('\n').filter(Boolean))].slice(0, 200).some(entry => local('merge-base', '--is-ancestor', tip, entry).status === 0);
}
export async function push(args) {
  const ownerBootstrap = args.length === 1 && args[0] === '--owner-bootstrap';
  if (args.length && !ownerBootstrap) throw new Error('Usage: push [--owner-bootstrap]');
  const { root, lanes, baseRef, configSource } = config(true, true, ownerBootstrap);
  if ((configSource === 'branch bootstrap') !== ownerBootstrap) throw new Error('A first-config push requires --owner-bootstrap; that mode selects the configured owner credential and verifies repository admin permission');
  requireLinkedWorktree();
  if (!lanes.repo || !lanes.implementer || !lanes.reviewer) throw new Error('Configure identities.implementer and identities.reviewer; repo comes from origin and Owner from CODEOWNERS');
  const repo = parseRepo(lanes.repo);
  const user = lanes.implementer;
  const reviewer = lanes.reviewer;
  let owner = lanes.owner;
  if (owner == null) {
    if (![user, reviewer].every(value => typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value)) || user.toLowerCase() === reviewer.toLowerCase()) throw new Error('Configure distinct implementer, reviewer and owner accounts in trusted roles');
  } else assertDistinctPushRoles({ owner, implementer: user, reviewer });
  if (user.toLowerCase() === repo.split('/')[0].toLowerCase()) throw new Error('Implementer cannot be the repository owner');
  const branch = git('symbolic-ref', '--quiet', '--short', 'HEAD');
  git('check-ref-format', '--branch', branch);
  const defaultBranch = baseRef.slice('refs/remotes/origin/'.length);
  if (lanes.base != null && lanes.base !== defaultBranch) throw new Error('Configured base differs from the verified default branch; role authority is unavailable');
  if (branch === defaultBranch || branch === (lanes.base || 'main') || branch === 'master') throw new Error('Refusing to push a default branch');
  const remote = git('remote', 'get-url', '--push', 'origin');
  if (!githubPushRemoteMatches(remote, repo)) throw new Error('origin push URL must match lanes.repo on github.com');
  // Git runs in the actual worktree. Refuse configuration that could redirect
  // the explicit destination or add an unverified authorization header.
  const configArgs = { cwd: root, encoding: 'utf8', env: cleanEnvironment() };
  const headers = spawnSync('git', ['config', '--get-regexp', '^(http\\..*extraheader|http\\.extraheader)$'], configArgs);
  if (headers.error || ![0, 1].includes(headers.status) || headers.status === 0) throw new Error('Git authorization header may change the verified push');
  const rewrites = spawnSync('git', ['config', '--null', '--get-regexp', '^url\\..*\\.(insteadof|pushinsteadof)$'], configArgs);
  if (rewrites.error || ![0, 1].includes(rewrites.status)) throw new Error('Cannot inspect Git URL rewrites');
  const destination = `https://github.com/${repo}.git`;
  for (const entry of rewrites.stdout.split('\0').filter(Boolean)) {
    const separator = entry.indexOf('\n');
    if (separator < 0) throw new Error('Cannot inspect Git URL rewrites');
    const prefix = entry.slice(separator + 1);
    if (prefix && destination.startsWith(prefix)) throw new Error('Git URL rewrite may change the verified push');
  }
  const env = cleanEnvironment();
  if (ownerBootstrap && !owner) throw new Error('The trusted base CODEOWNERS must identify the owner for first-config bootstrap');
  const token = run('gh', ['auth', 'token', '--hostname', 'github.com', '--user', ownerBootstrap ? owner : user], { cwd: root, env });
  if (!token || /\s/.test(token)) throw new Error(`No usable ${ownerBootstrap ? 'configured owner' : 'implementer'} credential`);
  const actor = jsonCommand('gh', ['api', '--hostname', 'github.com', 'user'], { cwd: root, env: { ...env, GH_TOKEN: token } }).login;
  const expectedActor = ownerBootstrap ? owner : user;
  if (typeof actor !== 'string' || actor.toLowerCase() !== expectedActor.toLowerCase() || (!ownerBootstrap && actor.toLowerCase() === reviewer.toLowerCase())) throw new Error(`Authenticated actor does not match the authorized ${ownerBootstrap ? 'owner' : 'implementer'}`);
  const metadataEnv = { ...env, GH_TOKEN: token };
  const metadata = jsonCommand('gh', ['api', '--hostname', 'github.com', `repos/${repo}`], { cwd: root, env: metadataEnv });
  if (owner == null) {
    if (metadata.owner?.type !== 'User' || typeof metadata.owner?.login !== 'string' || metadata.owner.login.toLowerCase() !== repo.split('/')[0].toLowerCase()) throw new Error('Organization repositories require an explicit trusted owner');
    owner = metadata.owner.login;
  }
  assertDistinctPushRoles({ owner, implementer: user, reviewer });
  if (ownerBootstrap) {
    const permission = jsonCommand('gh', ['api', '--hostname', 'github.com', `repos/${repo}/collaborators/${encodeURIComponent(actor)}/permission`], { cwd: root, env: metadataEnv }).role_name;
    if (permission !== 'admin') throw new Error('Owner bootstrap requires an authenticated repository admin');
  }
  if (user.toLowerCase() === owner.toLowerCase()) throw new Error('Implementer cannot be the owner');
  if (metadata.default_branch !== defaultBranch) throw new Error('Fetched origin/HEAD does not match GitHub default branch; refresh origin');
  const remoteBase = jsonCommand('gh', ['api', '--hostname', 'github.com', `repos/${repo}/branches/${encodeURIComponent(defaultBranch)}`], { cwd: root, env: metadataEnv });
  if (!/^[0-9a-f]{40,64}$/i.test(remoteBase?.commit?.sha || '') || git('rev-parse', baseRef) !== remoteBase.commit.sha) throw new Error('Fetched base is stale or unverifiable; refresh origin before pushing');
  const pulls = jsonCommand('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--head', branch, '--limit', '100', '--json', 'number,autoMergeRequest'], { cwd: root, env: { ...env, GH_TOKEN: token } });
  if (!Array.isArray(pulls)) throw new Error('Cannot determine open PR auto-merge state');
  if (pulls.some(pr => pr.autoMergeRequest != null)) throw new Error('Open PR has auto-merge enabled; disable it before pushing');
  if (pulls.length >= 100) throw new Error('Open PR list may be incomplete; cannot check auto-merge safely');
  const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
  const head = git('rev-parse', 'HEAD');
  const helper = fileURLToPath(new URL('../git-askpass.mjs', import.meta.url));
  const hook = run('git', ['rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-push'], { cwd: root, env });
  const temporary = mkdtempSync(join(tmpdir(), 'workflow-push-'));
  const pushEnv = { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_ASKPASS: helper, GIT_TERMINAL_PROMPT: '0', WORKFLOW_IMPLEMENTER: actor, WORKFLOW_PRE_PUSH_HOOK: hook, WORKFLOW_PUSH_WORKTREE: root };
  if (env.GIT_CONFIG_GLOBAL !== undefined) pushEnv.WORKFLOW_HOOK_CONFIG_GLOBAL = env.GIT_CONFIG_GLOBAL;
  if (env.GIT_CONFIG_NOSYSTEM !== undefined) pushEnv.WORKFLOW_HOOK_CONFIG_NOSYSTEM = env.GIT_CONFIG_NOSYSTEM;
  try {
    run('git', ['init', '--bare', '--quiet', temporary], { cwd: root, env: pushEnv });
    writeFileSync(join(temporary, 'objects', 'info', 'alternates'), `${join(common, 'objects')}\n`);
    if (existsSync(join(common, 'shallow'))) copyFileSync(join(common, 'shallow'), join(temporary, 'shallow'));
    const wrapper = join(temporary, 'hooks', 'pre-push');
    copyFileSync(fileURLToPath(new URL('../push-hook.mjs', import.meta.url)), wrapper);
    chmodSync(wrapper, 0o755);
    const result = await new Promise((resolve, reject) => {
      let stderr = '';
      const child = spawn('git', [`--git-dir=${temporary}`, `--work-tree=${root}`, '-c', 'credential.helper=', '-c', 'http.extraHeader=', '-c', 'push.pushOption=', 'push', '--no-follow-tags', '--recurse-submodules=no', `https://github.com/${repo}.git`, `${head}:refs/heads/${branch}`], { cwd: root, env: pushEnv, stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.on('data', chunk => { if (stderr.length < 65536) stderr += chunk.toString().slice(0, 65536 - stderr.length); });
      child.on('error', reject);
      child.on('close', status => resolve({ status, stderr }));
    });
    if (result.status !== 0) {
      // `fetch first` means the remote tip is absent locally, so the remote moved whatever the stale tracking ref says.
      const rewritten = /non-fast-forward/i.test(result.stderr) && !/fetch first|stale info/i.test(result.stderr) && pushRewroteHistory(branch, head);
      const reason = rewritten ? `local history was rewritten over the fetched branch; restore its head from origin/${branch}, then merge base with \`git merge --no-ff --no-commit origin/${defaultBranch}\` instead of rebasing`
        : /non-fast-forward|fetch first|stale info/i.test(result.stderr) ? 'remote branch changed or is ahead'
        : /authentication failed|could not read (username|password)|invalid username or token|access denied/i.test(result.stderr) ? 'authentication failed'
        : /permission denied|protected branch|rule violations?|GH006|GH013/i.test(result.stderr) ? 'remote permissions or branch rules rejected the push'
        : /could not resolve host|failed to connect|connection (timed out|refused)|unable to access/i.test(result.stderr) ? 'network or remote connection failed'
        : 'unclassified Git failure';
      throw new Error(`Push failed (exit ${result.status ?? 'unknown'}): ${reason}; Git output withheld to protect credentials`);
    }
    console.log(JSON.stringify({ result: 'pushed', actor, repository: repo, branch, head, configSource }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
function parseOptions(args) {
  const options = {};
  while (args.length) {
    const key = args.shift();
    if (key === '--claim' && !Object.hasOwn(options, key)) { options[key] = true; continue; }
    if (!['--pr', '--previous', '--previous-base', '--issue'].includes(key) || !args.length || Object.hasOwn(options, key)) throw new Error('Invalid review-context arguments');
    options[key] = args.shift();
  }
  if (!/^[1-9]\d*$/.test(options['--pr'] || '')) throw new Error('--pr requires a pull request number');
  if (options['--issue'] && !/^[1-9]\d*$/.test(options['--issue'])) throw new Error('--issue requires an issue number');
  if (options['--previous'] && !/^[0-9a-f]{7,64}$/i.test(options['--previous'])) throw new Error('--previous requires a commit SHA');
  if (options['--previous-base'] && (!options['--previous'] || !/^[0-9a-f]{7,64}$/i.test(options['--previous-base']))) throw new Error('--previous-base requires a commit SHA and --previous');
  return options;
}
function resolveRepo(lanes) {
  let repo = lanes.repo;
  if (!repo) {
    const remote = git('remote', 'get-url', 'origin');
    const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
    if (!match) throw new Error('Cannot infer a github.com repository from origin');
    repo = match[1];
  }
  return parseRepo(repo);
}
const threadQuery = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage} nodes{id isResolved isOutdated path line comments(first:20){nodes{url body author{login}}}}}}}}';
function readThreads(repo, number, options) {
  const [owner, name] = repo.split('/');
  const data = jsonCommand('gh', ['api', 'graphql', '--hostname', 'github.com', '-f', `query=${threadQuery}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${number}`], options);
  const threads = data?.data?.repository?.pullRequest?.reviewThreads;
  if (!threads || !Array.isArray(threads.nodes) || typeof threads.pageInfo?.hasNextPage !== 'boolean') throw new Error('Cannot read review threads');
  return threads;
}
// The newest Reviewer verdict at an older head: a later round reads only the delta since that head.
export function previousReviewedHead(reviews, reviewer, head) {
  if (typeof reviewer !== 'string' || !reviewer) return null;
  const latest = (reviews || []).filter(review => review.author?.login?.toLowerCase() === reviewer.toLowerCase() && /<!-- agent-review\b[^>]*\bverdict=\w+/.test(review.body || '')).at(-1);
  const oid = latest?.commit?.oid;
  return typeof oid === 'string' && /^[0-9a-f]{7,64}$/i.test(oid) && oid !== head ? oid : null;
}
// Files grouped by area (the first two directory segments), largest first; a pure rename changes no line and is listed as mechanical.
export function reviewAreas(files = []) {
  const areas = new Map();
  const mechanical = [];
  for (const file of files) {
    if (typeof file?.path !== 'string') continue;
    const additions = file.additions || 0, deletions = file.deletions || 0;
    if (file.changeType === 'RENAMED' && !additions && !deletions) { mechanical.push(file.path); continue; }
    const area = file.path.split('/').slice(0, -1).slice(0, 2).join('/') || '.';
    const entry = areas.get(area) || { area, additions: 0, deletions: 0, files: [] };
    entry.additions += additions; entry.deletions += deletions; entry.files.push(file.path);
    areas.set(area, entry);
  }
  return { areas: [...areas.values()].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions) || a.area.localeCompare(b.area)), mechanical };
}
export function reviewContext(args) {
  const options = parseOptions(args);
  const { root, lanes, configAvailable } = config(false);
  const repo = resolveRepo(lanes);
  const pr = jsonCommand('gh', ['pr', 'view', options['--pr'], '--repo', `github.com/${repo}`, '--json', 'url,title,isDraft,labels,baseRefOid,headRefOid,files,reviews,reviewDecision,statusCheckRollup,comments'], { cwd: root });
  // The claim keeps a second reviewer off the PR; review-post releases it whatever the outcome.
  if (options['--claim'] && (pr.labels || []).some(label => label.name === 'state:reviewing')) throw new Error(`#${options['--pr']} is already claimed (state:reviewing); skip it`);
  const threads = readThreads(repo, options['--pr'], { cwd: root });
  const output = { untrustedGithubData: true, claimed: Boolean(options['--claim']), ...pr, baseConfigurationAvailable: configAvailable, filesMayBeIncomplete: true, ...reviewAreas(pr.files), reviewThreads: threads.nodes, threadsTruncated: threads.pageInfo.hasNextPage };
  const previous = options['--previous'] || previousReviewedHead(pr.reviews, lanes.reviewer, pr.headRefOid);
  if (previous) {
    const head = pr.headRefOid;
    if (!/^[0-9a-f]{40,64}$/i.test(head || '')) throw new Error('GitHub returned an invalid head SHA');
    try {
      const oldTree = git('rev-parse', `${previous}^{tree}`);
      const newTree = git('rev-parse', `${head}^{tree}`);
      const priorBase = options['--previous-base'];
      const currentBase = pr.baseRefOid;
      if (!/^[0-9a-f]{40,64}$/i.test(currentBase || '')) throw new Error('Invalid base SHA');
      const identicalBaseTree = priorBase ? git('rev-parse', `${priorBase}^{tree}`) === git('rev-parse', `${currentBase}^{tree}`) : null;
      output.comparison = { previous, previousFrom: options['--previous'] ? 'argument' : 'reviewer verdict', head, previousBase: priorBase || null, currentBase, identicalTree: oldTree === newTree, identicalBaseTree, treesUnchanged: oldTree === newTree && identicalBaseTree === true, changedFiles: oldTree === newTree ? [] : git('diff', '--name-only', previous, head).split('\n').filter(Boolean), evidenceRequiresJudgment: true };
    } catch { output.comparison = { previous, head, available: false, reason: 'Commits not present locally; fetch before comparing' }; }
  }
  if (options['--issue']) {
    const issue = jsonCommand('gh', ['issue', 'view', options['--issue'], '--repo', `github.com/${repo}`, '--json', 'url,body,comments'], { cwd: root });
    const comments = (issue.comments || []).filter(comment => /\b(decision|adjudicat|criteria|acceptance)\b/i.test(comment.body || '')).map(comment => ({ url: comment.url, body: (comment.body || '').slice(0, 4000), bodyTruncated: (comment.body || '').length > 4000 }));
    output.issue = { url: issue.url, body: (issue.body || '').slice(0, 8000), bodyTruncated: (issue.body || '').length > 8000, decisions: comments.slice(-20), decisionsMayBeIncomplete: true };
  }
  // Claimed only after every read succeeded, so a failed read never leaves a label no review-post will release.
  if (options['--claim']) run('gh', ['pr', 'edit', options['--pr'], '--repo', `github.com/${repo}`, '--add-label', 'state:reviewing'], { cwd: root });
  console.log(JSON.stringify(output));
}

const reviewEvents = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'];
const verdictIn = body => /<!-- agent-review\b[^>]*\bverdict=(\w+)/.exec(body)?.[1];
function reviewPostOptions(args, root) {
  const o = { '--resolve-thread': [] };
  const list = [...args];
  while (list.length) {
    const key = list.shift();
    if (!['--pr', '--sha', '--event', '--body-file', '--comments-file', '--resolve-thread'].includes(key) || !list.length) throw new Error('Usage: review-post --pr N --sha HEX --event APPROVE|REQUEST_CHANGES|COMMENT --body-file PATH [--comments-file PATH] [--resolve-thread ID]...');
    const value = list.shift();
    if (key === '--resolve-thread') o[key].push(value);
    else if (Object.hasOwn(o, key)) throw new Error(`${key} given twice`);
    else o[key] = value;
  }
  if (!/^[1-9]\d*$/.test(o['--pr'] || '')) throw new Error('--pr requires a pull request number');
  if (!/^[0-9a-f]{40,64}$/i.test(o['--sha'] || '')) throw new Error('--sha requires the full hex head commit SHA');
  if (!reviewEvents.includes(o['--event'])) throw new Error(`--event must be one of ${reviewEvents.join(', ')}`);
  if (o['--resolve-thread'].some(id => !/^[\w=-]+$/.test(id))) throw new Error('--resolve-thread requires a thread id');
  if (!o['--body-file']) throw new Error('--body-file is required');
  o.body = readWorkspaceText(root, o['--body-file']);
  if (!o.body.includes(`<!-- agent-review sha=${o['--sha']}`)) throw new Error('Review body must contain <!-- agent-review sha=<sha> ...');
  // The owner is asked only on an approved head: `verdict=owner` is an approval, never a comment or a change request.
  if (verdictIn(o.body) === 'owner' && o['--event'] !== 'APPROVE') throw new Error('verdict=owner requires --event APPROVE: the owner sees only a PR the Reviewer approved');
  o.comments = [];
  if (o['--comments-file']) {
    if (o['--comments-file'] === '-' && o['--body-file'] === '-') throw new Error('Only one of --body-file and --comments-file can read stdin');
    o.comments = JSON.parse(readWorkspaceText(root, o['--comments-file']));
    const valid = Array.isArray(o.comments) && o.comments.every(c => c && typeof c.path === 'string' && c.path && Number.isInteger(c.line) && c.line > 0 && typeof c.body === 'string' && c.body);
    if (!valid) throw new Error('Comments file must be a JSON array of {path, line, body}');
  }
  return o;
}
function reviewerToken(root, login) {
  const token = run('gh', ['auth', 'token', '--hostname', 'github.com', '--user', login], { cwd: root, env: cleanEnvironment() });
  if (!token || /\s/.test(token)) throw new Error('No usable reviewer credential');
  return token;
}
const resolveMutation = 'mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}';
function reviewerThreads(threads, login, approve, flagged) {
  return threads.nodes.filter(thread => {
    const first = thread.comments?.nodes?.[0];
    if (thread.isResolved || String(first?.author?.login).toLowerCase() !== login.toLowerCase()) return false;
    return flagged.has(thread.id) || (approve && /^\*\*(Nit|Pre-existing|Follow-up)/.test(first.body || ''));
  });
}
function resolveThread(thread, options) {
  run('gh', ['api', 'graphql', '--hostname', 'github.com', '-f', `query=${resolveMutation}`, '-f', `threadId=${thread.id}`], options);
}
// Posts the Reviewer's verdict as one call, resolves the Reviewer's own non-blocking threads first, and releases state:reviewing only after the post.
// Releasing the claim on every exit keeps a failed or abandoned review from hiding the PR from the next reviewer.
function releaseClaim(pr, repo, options) {
  try { run('gh', ['pr', 'edit', pr, '--repo', `github.com/${repo}`, '--remove-label', 'state:reviewing'], options); return true; } catch { console.error(`Warning: could not remove state:reviewing from #${pr}; remove it by hand.`); return false; }
}
export function reviewPost(args) {
  const { root, lanes } = config();
  const login = lanes.reviewer;
  if (typeof login !== 'string' || !/^[A-Za-z0-9-]+$/.test(login)) throw new Error('Configure identities.reviewer before posting a review');
  const repo = resolveRepo(lanes);
  const prIndex = args.indexOf('--pr');
  const pr = prIndex >= 0 && /^[1-9]\d*$/.test(args[prIndex + 1] || '') ? args[prIndex + 1] : null;
  let o;
  try { o = reviewPostOptions(args, root); } catch (error) {
    // A missing reviewer credential must not hide the argument error the caller has to fix.
    if (pr) { try { releaseClaim(pr, repo, { cwd: root, env: { ...cleanEnvironment(), GH_TOKEN: reviewerToken(root, login) } }); } catch { /* the original error still stands */ } }
    throw error;
  }
  const env = { ...cleanEnvironment(), GH_TOKEN: reviewerToken(root, login) };
  const options = { cwd: root, env };
  const approve = o['--event'] === 'APPROVE';
  try {
    const threads = readThreads(repo, pr, options);
    if (threads.pageInfo.hasNextPage) throw new Error('Too many review threads to resolve');
    const flagged = new Set(o['--resolve-thread']);
    for (const thread of reviewerThreads(threads, login, approve, flagged)) resolveThread(thread, options);
    const payload = { commit_id: o['--sha'], body: o.body, event: o['--event'], comments: o.comments.map(c => ({ path: c.path, line: c.line, side: 'RIGHT', body: c.body })) };
    const posted = jsonCommand('gh', ['api', '--hostname', 'github.com', `repos/${repo}/pulls/${pr}/reviews`, '--input', '-'], { ...options, input: JSON.stringify(payload) });
    if (!Number.isInteger(posted?.id)) throw new Error('GitHub did not confirm the review');
    console.log(`Posted review ${posted.id} on #${pr}`);
    // Only an approval the owner must join hands the PR to the owner; the CLI, not the agent, sets that label.
    if (approve && verdictIn(o.body) === 'owner') {
      try { run('gh', ['pr', 'edit', pr, '--repo', `github.com/${repo}`, '--add-label', 'review:owner'], options); } catch { console.error(`Warning: review posted, but could not add review:owner to #${pr}; add it by hand.`); }
    }
    // The inline Nit and Pre-existing notes of this review are open threads now; the posted verdict stands if resolving them fails.
    if (approve) {
      try {
        for (const thread of reviewerThreads(readThreads(repo, pr, options), login, true, new Set())) resolveThread(thread, options);
      } catch (error) { console.error(`Warning: review posted, but could not resolve its Nit or Pre-existing threads on #${pr} (${String(error.message).replace(/\s+/g, ' ').slice(0, 200)}); resolve them by hand.`); }
    }
  } catch (error) {
    const reason = String(error.message).replace(/\s+/g, ' ').slice(0, 300);
    try { run('gh', ['pr', 'comment', pr, '--repo', `github.com/${repo}`, '--body', `<!-- agent-review post-failed sha=${o['--sha']} --> Review post failed (${o['--event']}): ${reason}`], options); } catch { /* the exit code still signals failure */ }
    releaseClaim(pr, repo, options);
    console.error(`Blocked: review post failed (${reason}); claim released, retry.`);
    process.exitCode = 1;
    return;
  }
  releaseClaim(pr, repo, options);
}
