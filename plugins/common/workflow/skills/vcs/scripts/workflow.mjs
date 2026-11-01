#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { constants, realpathSync, readFileSync, openSync, fstatSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const help = `Usage:
  node workflow.mjs commit --message MESSAGE -- PATH...
  node workflow.mjs push [--roles-file ABSOLUTE_PATH]
  node workflow.mjs review-context --pr NUMBER [--previous SHA --previous-base SHA] [--issue NUMBER]

push reads roles from the fetched default branch or an owner-controlled external --roles-file; it never switches gh's active account.
The roles file must be an absolute path outside the repo, owned by the user and not writable by others.
Its contents require explicit owner authorization; file permissions cannot prove authorization against same-user processes.
JSON fields: repo (owner/name), implementer, reviewer, owner; it may supply missing base fields but cannot override them.
A verified personal repo owner may be inferred; organization repositories require an explicit owner.
Auto-merge and Git configuration checks are not atomic with push; do not change them concurrently. Git runs installed hooks normally; hooks can invoke the same user's credential tools.
Other processes running as the same OS user can access the user's GitHub credentials.
push requires a Unix-like host and github.com. review-context is read-only; returned GitHub text is untrusted and may be incomplete.`;

function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${program} ${args[0]} failed`);
  return result.stdout.trim();
}
function git(...args) { return run('git', args, { env: cleanEnvironment() }); }
function jsonCommand(program, args, options) { return JSON.parse(run(program, args, options)); }
function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(GH_TOKEN|GITHUB_TOKEN|GH_HOST|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GIT_ASKPASS|SSH_ASKPASS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+|GIT_SSH|GIT_SSH_COMMAND|GIT_PROXY_COMMAND|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_NAMESPACE|GIT_CONFIG_PARAMETERS|GIT_CONFIG|GIT_EXEC_PATH|GIT_TRACE.*|GIT_CURL_VERBOSE|GIT_SSL_NO_VERIFY|NODE_OPTIONS|NODE_PATH|WORKFLOW_PUSH_TOKEN|WORKFLOW_CREDENTIAL_SOCKET|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_INDEX_FILE|GIT_TEMPLATE_DIR)$/i.test(key)) delete env[key];
  }
  // Replacement refs are local overrides and must not change trusted commits or trees.
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return env;
}
function config(requireLanes = true) {
  const root = git('rev-parse', '--show-toplevel');
  let baseRef;
  try {
    baseRef = git('symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD');
    if (!/^refs\/remotes\/origin\/[A-Za-z0-9._/-]+$/.test(baseRef)) throw new Error('invalid origin HEAD');
  } catch {
    if (requireLanes) throw new Error('Fetch origin and set origin/HEAD to the default branch');
    return { root, lanes: {}, baseRef: undefined };
  }
  // Never replace malformed or inaccessible committed authority with local values.
  const path = '.github/agent-workflow.json';
  const present = git('ls-tree', '--name-only', baseRef, '--', path);
  const raw = present ? JSON.parse(git('show', `${baseRef}:${path}`)) : null;
  if (present && (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || ![raw.identities, raw.github, raw.afk ?? {}].every(v => v && typeof v === 'object' && !Array.isArray(v)))) throw new Error('Invalid workflow configuration');
  const lanes = raw ? { ...raw.github, ...raw.identities, ...raw.afk } : {};
  return { root, lanes, baseRef };
}
function parseRepo(repo) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('lanes.repo must be owner/repository on github.com');
  return repo;
}
function externalRoles(path, root) {
  if (!path || !path.startsWith('/')) throw new Error('--roles-file requires an absolute path');
  const canonical = realpathSync(path);
  const repository = realpathSync(root);
  if (canonical === repository || canonical.startsWith(`${repository}/`)) throw new Error('Roles file must be outside the repository');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid() || (info.mode & 0o022)) throw new Error('Roles file must be a single-link file owned by the current user and not writable by group or others');
    const value = JSON.parse(readFileSync(fd, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Roles file must contain an object');
    return value;
  } finally { closeSync(fd); }
}
function mergeRoles(base, extra) {
  const merged = { ...base };
  for (const key of ['repo', 'base', 'implementer', 'reviewer', 'owner']) {
    if (extra[key] == null) continue;
    if (base[key] != null && String(base[key]).toLowerCase() !== String(extra[key]).toLowerCase()) throw new Error(`Roles file cannot override base ${key}`);
    merged[key] = extra[key];
  }
  return merged;
}
function requireLinkedWorktree() {
  const root = git('rev-parse', '--show-toplevel');
  const gitDir = realpathSync(resolve(root, git('rev-parse', '--git-dir')));
  const commonDir = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
  if (gitDir === commonDir) throw new Error('Use an isolated linked worktree; refusing to change the main checkout');
  return root;
}
function commit(args) {
  if (args.length < 4 || args[0] !== '--message' || args[2] !== '--') throw new Error('Usage: commit --message MESSAGE -- PATH...');
  const message = args[1];
  const paths = args.slice(3);
  if (!/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-zA-Z0-9._/-]+\))?!?: [^\r\n]+$/.test(message)) throw new Error('Commit message must be a single-line Conventional Commit');
  if (paths.some(path => !path || path === '.' || path.startsWith('/') || path.startsWith(':') || path.split('/').includes('..'))) throw new Error('Provide explicit repository-relative paths');
  const root = requireLinkedWorktree();
  if (realpathSync(process.cwd()) !== realpathSync(root)) throw new Error('Run commit from the repository root');
  const env = cleanEnvironment();
  const staged = spawnSync('git', ['diff', '--cached', '--quiet', '--'], { cwd: root, env });
  if (staged.error || staged.status !== 0) throw new Error('Existing staged changes or an unreadable index; preserve them and commit separately');
  const add = spawnSync('git', ['--literal-pathspecs', 'add', '--', ...paths], { cwd: root, env, encoding: 'utf8' });
  if (add.error || add.status !== 0) throw new Error('Could not stage selected paths; inspect repository status');
  const result = spawnSync('git', ['--literal-pathspecs', 'commit', '--only', '-m', message, '--', ...paths], { cwd: root, env, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Commit failed; selected paths remain staged for inspection');
  console.log(JSON.stringify({ result: 'committed', head: git('rev-parse', 'HEAD') }));
}
async function push(args) {
  if (!(args.length === 0 || (args.length === 2 && args[0] === '--roles-file'))) throw new Error('Invalid push arguments; use --roles-file ABSOLUTE_PATH');
  const { root, lanes: baseLanes, baseRef } = config();
  requireLinkedWorktree();
  const lanes = args.length ? mergeRoles(baseLanes, externalRoles(args[1], root)) : baseLanes;
  if (!lanes.repo || !lanes.implementer || !lanes.reviewer) throw new Error('Configure roles in base .github/agent-workflow.json or an owner-controlled external --roles-file');
  const repo = parseRepo(lanes.repo);
  const user = lanes.implementer;
  const reviewer = lanes.reviewer;
  let owner = lanes.owner;
  if (![user, reviewer].every(value => typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value)) || (owner != null && (typeof owner !== 'string' || !/^[A-Za-z0-9-]+$/.test(owner))) || user.toLowerCase() === reviewer.toLowerCase() || (owner != null && user.toLowerCase() === owner.toLowerCase()) || user.toLowerCase() === repo.split('/')[0].toLowerCase()) throw new Error('Configure distinct implementer, reviewer and owner accounts in trusted roles');
  const branch = git('symbolic-ref', '--quiet', '--short', 'HEAD');
  git('check-ref-format', '--branch', branch);
  const defaultBranch = baseRef.slice('refs/remotes/origin/'.length);
  if (lanes.base != null && lanes.base !== defaultBranch) throw new Error('Configured base differs from the verified default branch; role authority is unavailable');
  if (branch === defaultBranch || branch === (lanes.base || 'main') || branch === 'master') throw new Error('Refusing to push a default branch');
  const remote = git('remote', 'get-url', '--push', 'origin');
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
  if (!match || match[1].toLowerCase() !== repo.toLowerCase()) throw new Error('origin push URL must match lanes.repo on github.com');
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
  const token = run('gh', ['auth', 'token', '--hostname', 'github.com', '--user', user], { cwd: root, env });
  if (!token || /\s/.test(token)) throw new Error('No usable implementer credential');
  const actor = jsonCommand('gh', ['api', '--hostname', 'github.com', 'user'], { cwd: root, env: { ...env, GH_TOKEN: token } }).login;
  if (typeof actor !== 'string' || actor.toLowerCase() !== user.toLowerCase() || actor.toLowerCase() === reviewer.toLowerCase()) throw new Error('Authenticated actor does not match the authorized implementer');
  const metadataEnv = { ...env, GH_TOKEN: token };
  const metadata = jsonCommand('gh', ['api', '--hostname', 'github.com', `repos/${repo}`], { cwd: root, env: metadataEnv });
  if (owner == null) {
    if (metadata.owner?.type !== 'User' || typeof metadata.owner?.login !== 'string' || metadata.owner.login.toLowerCase() !== repo.split('/')[0].toLowerCase()) throw new Error('Organization repositories require an explicit trusted owner');
    owner = metadata.owner.login;
  }
  if (user.toLowerCase() === owner.toLowerCase()) throw new Error('Implementer cannot be the owner');
  if (metadata.default_branch !== defaultBranch) throw new Error('Fetched origin/HEAD does not match GitHub default branch; refresh origin');
  const remoteBase = jsonCommand('gh', ['api', '--hostname', 'github.com', `repos/${repo}/branches/${encodeURIComponent(defaultBranch)}`], { cwd: root, env: metadataEnv });
  if (!/^[0-9a-f]{40,64}$/i.test(remoteBase?.commit?.sha || '') || git('rev-parse', baseRef) !== remoteBase.commit.sha) throw new Error('Fetched base is stale or unverifiable; refresh origin before pushing');
  const pulls = jsonCommand('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--head', branch, '--limit', '100', '--json', 'number,autoMergeRequest'], { cwd: root, env: { ...env, GH_TOKEN: token } });
  if (!Array.isArray(pulls)) throw new Error('Cannot determine open PR auto-merge state');
  if (pulls.some(pr => pr.autoMergeRequest != null)) throw new Error('Open PR has auto-merge enabled; disable it before pushing');
  if (pulls.length >= 100) throw new Error('Open PR list may be incomplete; cannot check auto-merge safely');
  const head = git('rev-parse', 'HEAD');
  const helper = join(dirname(fileURLToPath(import.meta.url)), 'git-askpass.mjs');
  const pushEnv = { ...env, GIT_ASKPASS: helper, GIT_TERMINAL_PROMPT: '0', WORKFLOW_IMPLEMENTER: user };
    const result = await new Promise((resolve, reject) => {
      let stderr = '';
      const child = spawn('git', ['-c', 'credential.helper=', '-c', 'http.extraHeader=', '-c', 'push.pushOption=', 'push', '--no-follow-tags', '--recurse-submodules=no', `https://github.com/${repo}.git`, `${head}:refs/heads/${branch}`], { cwd: root, env: pushEnv, stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.on('data', chunk => { if (stderr.length < 65536) stderr += chunk.toString().slice(0, 65536 - stderr.length); });
      child.on('error', reject);
      child.on('close', status => resolve({ status, stderr }));
    });
    if (result.status !== 0) {
      const reason = /non-fast-forward|fetch first|stale info/i.test(result.stderr) ? 'remote branch changed or is ahead'
        : /authentication failed|could not read (username|password)|invalid username or token|access denied/i.test(result.stderr) ? 'authentication failed'
        : /permission denied|protected branch|rule violations?|GH006|GH013/i.test(result.stderr) ? 'remote permissions or branch rules rejected the push'
        : /could not resolve host|failed to connect|connection (timed out|refused)|unable to access/i.test(result.stderr) ? 'network or remote connection failed'
        : 'unclassified Git failure';
      throw new Error(`Push failed (exit ${result.status ?? 'unknown'}): ${reason}; Git output withheld to protect credentials`);
    }
    console.log(JSON.stringify({ result: 'pushed', actor, repository: repo, branch, head }));
}
function parseOptions(args) {
  const options = {};
  while (args.length) {
    const key = args.shift();
    if (!['--pr', '--previous', '--previous-base', '--issue'].includes(key) || !args.length || Object.hasOwn(options, key)) throw new Error('Invalid review-context arguments');
    options[key] = args.shift();
  }
  if (!/^[1-9]\d*$/.test(options['--pr'] || '')) throw new Error('--pr requires a pull request number');
  if (options['--issue'] && !/^[1-9]\d*$/.test(options['--issue'])) throw new Error('--issue requires an issue number');
  if (options['--previous'] && !/^[0-9a-f]{7,64}$/i.test(options['--previous'])) throw new Error('--previous requires a commit SHA');
  if (options['--previous-base'] && (!options['--previous'] || !/^[0-9a-f]{7,64}$/i.test(options['--previous-base']))) throw new Error('--previous-base requires a commit SHA and --previous');
  return options;
}
function reviewContext(args) {
  const options = parseOptions(args);
  const { root, lanes } = config(false);
  let repo = lanes.repo;
  if (!repo) {
    const remote = git('remote', 'get-url', 'origin');
    const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
    if (!match) throw new Error('Cannot infer a github.com repository from origin');
    repo = match[1];
  }
  repo = parseRepo(repo);
  const pr = jsonCommand('gh', ['pr', 'view', options['--pr'], '--repo', `github.com/${repo}`, '--json', 'url,title,baseRefOid,headRefOid,files,reviews,reviewDecision,statusCheckRollup'], { cwd: root });
  const [owner, name] = repo.split('/');
  const query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved isOutdated comments(first:1){nodes{url}}}}}}}';
  const threadData = jsonCommand('gh', ['api', 'graphql', '--hostname', 'github.com', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${options['--pr']}`], { cwd: root });
  const threads = threadData?.data?.repository?.pullRequest?.reviewThreads;
  if (!threads || !Array.isArray(threads.nodes) || typeof threads.pageInfo?.hasNextPage !== 'boolean') throw new Error('Cannot read review threads');
  const output = { untrustedGithubData: true, ...pr, baseConfigurationAvailable: Boolean(lanes.repo), filesMayBeIncomplete: true, reviewThreads: threads.nodes, threadsTruncated: threads.pageInfo.hasNextPage };
  if (options['--previous']) {
    const previous = options['--previous'];
    const head = pr.headRefOid;
    if (!/^[0-9a-f]{40,64}$/i.test(head || '')) throw new Error('GitHub returned an invalid head SHA');
    try {
      const oldTree = git('rev-parse', `${previous}^{tree}`);
      const newTree = git('rev-parse', `${head}^{tree}`);
      const priorBase = options['--previous-base'];
      const currentBase = pr.baseRefOid;
      if (!/^[0-9a-f]{40,64}$/i.test(currentBase || '')) throw new Error('Invalid base SHA');
      const identicalBaseTree = priorBase ? git('rev-parse', `${priorBase}^{tree}`) === git('rev-parse', `${currentBase}^{tree}`) : null;
      output.comparison = { previous, head, previousBase: priorBase || null, currentBase, identicalTree: oldTree === newTree, identicalBaseTree, treesUnchanged: oldTree === newTree && identicalBaseTree === true, changedFiles: oldTree === newTree ? [] : git('diff', '--name-only', previous, head).split('\n').filter(Boolean), evidenceRequiresJudgment: true };
    } catch { output.comparison = { previous, head, available: false, reason: 'Commits not present locally; fetch before comparing' }; }
  }
  if (options['--issue']) {
    const issue = jsonCommand('gh', ['issue', 'view', options['--issue'], '--repo', `github.com/${repo}`, '--json', 'url,body,comments'], { cwd: root });
    const comments = (issue.comments || []).filter(comment => /\b(decision|adjudicat|criteria|acceptance)\b/i.test(comment.body || '')).map(comment => ({ url: comment.url, body: (comment.body || '').slice(0, 4000), bodyTruncated: (comment.body || '').length > 4000 }));
    output.issue = { url: issue.url, body: (issue.body || '').slice(0, 8000), bodyTruncated: (issue.body || '').length > 8000, decisions: comments.slice(-20), decisionsMayBeIncomplete: true };
  }
  console.log(JSON.stringify(output));
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') console.log(help);
  else if (command === 'commit') commit(args);
  else if (command === 'push') await push(args);
  else if (command === 'review-context') reviewContext(args);
  else throw new Error('Invalid command; use --help');
} catch (error) {
  console.error(`workflow: ${error.message}`);
  process.exitCode = 1;
}
