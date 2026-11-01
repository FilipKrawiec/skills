#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync, readFileSync, mkdirSync, rmSync, writeFileSync, renameSync, statSync, existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { manifestsCommand } from './manifests.mjs';
import { projectVerify } from './project-verify.mjs';
import { releaseCommand } from './release.mjs';
import { safetyCommand } from './safety.mjs';
import { runWithLocks } from './locks.mjs';

const help = `Usage:
  node workflow.mjs commit --message MESSAGE -- PATH...
  node workflow.mjs push [--owner-bootstrap]
  node workflow.mjs review-context --pr NUMBER [--previous SHA --previous-base SHA] [--issue NUMBER]
  node workflow.mjs issue claim|status|comment|close|queue ...
  node workflow.mjs labels ensure
  node workflow.mjs cache show|refresh
  node workflow.mjs cache refresh
  node workflow.mjs afk install|uninstall|watch|start|check|merge|end|runs|reap ...
  node workflow.mjs afk start --me RUN_ID [--issue NUMBER]
  node workflow.mjs afk watch [--issue NUMBER]
  node workflow.mjs manifests verify|sync
  node workflow.mjs project [--root DIR] [--strict-git] [TASK]
  node workflow.mjs release [auto|patch|minor|major] [--message TEXT] [--dry-run] [--root DIR]
  node workflow.mjs safety check|apply

push reads the implementer from the fetched default branch's .agents/config.json and derives owner/reviewer from origin and base .github/CODEOWNERS. For the first config addition, it reads the implementer from the committed branch and selects the inferred owner's stored credential without switching gh's active account.
A verified personal repo owner may be inferred; CODEOWNERS must identify one owner account unambiguously.
Auto-merge and Git configuration checks are not atomic with push; do not change them concurrently. Git runs installed hooks normally; hooks can invoke the same user's credential tools.
Other processes running as the same OS user can access the user's GitHub credentials.
push requires a Unix-like host and github.com. review-context is read-only; returned GitHub text is untrusted and may be incomplete.`;

const heldWorkflowLocks = new Set();
export const workflowDefaults = {
  github: { requiredChecks: ['verify'], metadataCacheHours: 24 },
  afk: {
    runPrefix: 'afk-', maxRuns: 4, environmentFile: '~/.config/gh-agents/workflow-env.json',
    watchIntervalSeconds: 60, startCommand: ['pi', '--provider', 'ollama', '--model', '{model}', '--no-session', '--print', '--name', '{runId}', '--tools', 'bash', '{prompt}'],
    model: 'coding:latest', promptPrefix: '/skill:afk', pluginUpdateCommands: [],
  },
  explore: { personas: '.agents/personas.md', maxIssues: 3, idleHours: 24, capturesBranch: 'explore-captures' },
};

function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    const scopeFailure = program === 'gh' ? githubScopeFailure(result.stderr || '') : null;
    throw new Error(scopeFailure || `${program} ${args[0]} failed`);
  }
  return result.stdout.trim();
}
export function githubScopeFailure(stderr) {
  const direct = /missing required scopes?\s*\[([^\]]*)\]/i.exec(stderr);
  if (direct) {
    const missing = [...direct[1].matchAll(/['"]?([A-Za-z0-9:_-]+)['"]?/g)].map(match => match[1]);
    return missing.length ? `GitHub token is missing required scope(s): ${missing.join(', ')}.` : null;
  }
  const required = /requires one of the following scopes:\s*\[([^\]]*)\]/i.exec(stderr);
  const granted = /only been granted the:\s*\[([^\]]*)\]/i.exec(stderr);
  if (!required || !granted) return null;
  const scopes = value => [...value.matchAll(/['"]([A-Za-z0-9:_-]+)['"]/g)].map(match => match[1]);
  const missing = scopes(required[1]); const current = scopes(granted[1]);
  if (!missing.length || !current.length) return null;
  return `GitHub token is missing required scope(s): ${missing.join(', ')}; current token has: ${current.join(', ')}.`;
}
export function missingProjectScope(error) {
  const missing = /^GitHub token is missing required scope\(s\): ([^;]+)/.exec(error?.message || '')?.[1];
  return Boolean(missing?.split(',').some(scope => ['read:project', 'project'].includes(scope.trim().replace(/\.$/, ''))));
}
export function hasLockfAncestor(commands) {
  return commands.some(command => basename(command.trim().split(/\s+/, 1)[0]) === 'lockf');
}
export function validateIssueCommentBody(body) {
  if (typeof body !== 'string' || !body.trim() || body.length > 60_000) throw new Error('Issue comment body must contain 1–60000 characters');
  return body;
}
export function workspaceFilePath(root, path) {
  const canonicalRoot = realpathSync(root);
  const canonicalFile = realpathSync(resolve(path));
  const fromRoot = relative(canonicalRoot, canonicalFile);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error('Issue comment body file must be inside the current worktree');
  const file = statSync(canonicalFile);
  if (!file.isFile()) throw new Error('Issue comment body path must be a regular file');
  if (file.nlink > 1) throw new Error('Issue comment body file must not have multiple hard links');
  return canonicalFile;
}
function git(...args) { return run('git', args, { env: cleanEnvironment() }); }
function jsonCommand(program, args, options) { return JSON.parse(run(program, args, options)); }
function cleanEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(GH_TOKEN|GITHUB_TOKEN|GH_HOST|GH_CONFIG_DIR|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GIT_ASKPASS|SSH_ASKPASS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+|GIT_SSH|GIT_SSH_COMMAND|GIT_PROXY_COMMAND|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_NAMESPACE|GIT_CONFIG_PARAMETERS|GIT_CONFIG|GIT_EXEC_PATH|GIT_TRACE.*|GIT_CURL_VERBOSE|GIT_SSL_NO_VERIFY|NODE_OPTIONS|NODE_PATH|WORKFLOW_PUSH_TOKEN|WORKFLOW_CREDENTIAL_SOCKET|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_INDEX_FILE|GIT_TEMPLATE_DIR)$/i.test(key)) delete env[key];
  }
  // Replacement refs are local overrides and must not change trusted commits or trees.
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return env;
}
export function afkAgentEnvironment(source = process.env) { return cleanEnvironment(source); }
export function assertDistinctPushRoles({ owner, implementer, reviewer }) {
  const values = [owner, implementer, reviewer];
  if (values.some(value => typeof value !== 'string' || !/^[A-Za-z0-9-]+$/.test(value)) || new Set(values.map(value => value.toLowerCase())).size !== values.length) {
    throw new Error('Configure distinct implementer, reviewer and owner accounts in trusted roles');
  }
}
function config(requireLanes = true, allowBootstrap = false) {
  const root = git('rev-parse', '--show-toplevel');
  let baseRef;
  try {
    baseRef = git('symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD');
    if (!/^refs\/remotes\/origin\/[A-Za-z0-9._/-]+$/.test(baseRef)) throw new Error('invalid origin HEAD');
  } catch {
    if (requireLanes) throw new Error('Fetch origin and set origin/HEAD to the default branch');
    return { root, lanes: {}, baseRef: undefined, configAvailable: false };
  }
  // Never replace malformed or inaccessible committed authority with local values.
  const path = '.agents/config.json';
  const present = git('ls-tree', '--name-only', baseRef, '--', path);
  let source = 'base';
  let configPath = present ? `${baseRef}:${path}` : null;
  if (!present && allowBootstrap && git('ls-tree', '--name-only', 'HEAD', '--', path)) {
    configPath = `HEAD:${path}`;
    source = 'branch bootstrap';
  }
  const raw = configPath ? JSON.parse(git('show', configPath)) : null;
  if (configPath && (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || ![raw.identities ?? {}, raw.github ?? {}, raw.afk ?? {}, raw.explore ?? {}].every(v => v && typeof v === 'object' && !Array.isArray(v)))) throw new Error('Invalid workflow configuration');
  if (raw && source === 'branch bootstrap' && (['owner', 'reviewer'].some(key => Object.hasOwn(raw.identities || {}, key))
    || ['repo', 'base'].some(key => Object.hasOwn(raw.github || {}, key))
    || ['personas', 'capturesBranch', 'epic', 'worktree', 'maxIssues', 'idleHours'].some(key => Object.hasOwn(raw.explore || {}, key))
    || Object.hasOwn(raw, 'labels'))) {
    throw new Error('Workflow roles and GitHub metadata come from CODEOWNERS/Git and the local cache; use CLI defaults for labels and exploration settings');
  }
  const lanes = raw ? { ...raw.github, ...raw.identities, ...raw.afk, explore: raw.explore || {} } : {};
  const remote = git('remote', 'get-url', 'origin');
  lanes.repo = githubRepoFromRemote(remote);
  lanes.base = baseRef.slice('refs/remotes/origin/'.length);
  lanes.requiredChecks ??= workflowDefaults.github.requiredChecks;
  const { owner, reviewer } = codeownersRoles(baseRef, lanes.repo);
  lanes.owner = owner;
  lanes.reviewer = reviewer;
  return { root, lanes, baseRef, configSource: source, configAvailable: Boolean(configPath) };
}
export function githubRepoFromRemote(remote) {
  const match = /^(?:https:\/\/(?:www\.)?github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote || '');
  if (!match) throw new Error('origin must identify a GitHub owner/repository');
  return match[1];
}
function codeownersRoles(baseRef, repo) {
  let contents;
  try { contents = git('show', `${baseRef}:.github/CODEOWNERS`); }
  catch { throw new Error('The trusted base must contain .github/CODEOWNERS to identify review roles'); }
  return codeownersRolesFrom(contents, repo);
}
export function codeownersRolesFrom(contents, repo) {
  const rules = contents.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim().split(/\s+/).filter(Boolean)).filter(parts => parts.length);
  const wildcard = [...rules].reverse().find(parts => parts[0] === '*');
  const reviewers = wildcard?.slice(1).filter(value => /^@[A-Za-z0-9-]+$/.test(value)).map(value => value.slice(1)) || [];
  if (reviewers.length !== 1) throw new Error('The trusted .github/CODEOWNERS must name exactly one user for the default Reviewer');
  const reviewer = reviewers[0];
  const repoOwner = repo.split('/')[0];
  const owners = [...new Set(rules.flatMap((parts, index) => index === rules.indexOf(wildcard) ? [] : parts.slice(1)).filter(value => /^@[A-Za-z0-9-]+$/.test(value)).map(value => value.slice(1)))];
  const owner = owners.find(value => value.toLowerCase() === repoOwner.toLowerCase())
    || (owners.length === 1 ? owners[0] : null);
  if (!owner) throw new Error('The trusted .github/CODEOWNERS must identify one Owner account; organization repositories cannot use the organization slug as a user login');
  return { owner, reviewer };
}
function parseRepo(repo) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('lanes.repo must be owner/repository on github.com');
  return repo;
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
  const ownerBootstrap = args.length === 1 && args[0] === '--owner-bootstrap';
  if (args.length && !ownerBootstrap) throw new Error('Usage: push [--owner-bootstrap]');
  const { root, lanes, baseRef, configSource } = config(true, true);
  if ((configSource === 'branch bootstrap') !== ownerBootstrap) throw new Error('A first-config push requires --owner-bootstrap; that mode selects the configured owner credential and verifies repository admin permission');
  requireLinkedWorktree();
  if (!lanes.repo || !lanes.implementer || !lanes.reviewer) throw new Error('Configure identities.implementer; repo comes from origin and review roles from CODEOWNERS');
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
  const head = git('rev-parse', 'HEAD');
  const helper = join(dirname(fileURLToPath(import.meta.url)), 'git-askpass.mjs');
  const pushEnv = { ...env, GIT_ASKPASS: helper, GIT_TERMINAL_PROMPT: '0', WORKFLOW_IMPLEMENTER: actor };
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
    console.log(JSON.stringify({ result: 'pushed', actor, repository: repo, branch, head, configSource }));
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
  const { root, lanes, configAvailable } = config(false);
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
  const output = { untrustedGithubData: true, ...pr, baseConfigurationAvailable: configAvailable, filesMayBeIncomplete: true, reviewThreads: threads.nodes, threadsTruncated: threads.pageInfo.hasNextPage };
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

// AFK is deliberately a small set of deterministic GitHub operations. Product
// decisions and implementation stay in the skills; this code only assigns,
// tracks and closes work for the unattended runner.
const afkMarker = (kind, id) => `<!-- afk-${kind} session=${id} -->`;
const afkGh = args => jsonCommand('gh', args);
export function readThroughLocalCache(path, key, load, { ttlMs = 86_400_000, now = Date.now(), refresh = false, expectedFields = [] } = {}) {
  let cache = {};
  try { cache = JSON.parse(readFileSync(path, 'utf8')); } catch {}
  const current = cache[key];
  const fields = current?.fields || {};
  const fresh = Object.fromEntries(Object.entries(fields).filter(([, entry]) => Number.isFinite(entry.at) && now - entry.at < ttlMs).map(([name, entry]) => [name, entry.value]));
  if (!refresh && expectedFields.length && expectedFields.every(field => Object.hasOwn(fresh, field))) return fresh;
  const loaded = load();
  const nextFields = { ...fields };
  const discovered = loaded;
  for (const [field, fieldValue] of Object.entries(discovered)) if (fieldValue !== undefined) nextFields[field] = { at: now, value: fieldValue };
  const value = Object.fromEntries(Object.entries(nextFields).filter(([, entry]) => Number.isFinite(entry.at) && now - entry.at < ttlMs).map(([name, entry]) => [name, entry.value]));
  mkdirSync(dirname(path), { recursive: true });
  const next = { ...cache, [key]: { fields: nextFields } };
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(next));
  renameSync(temp, path);
  return value;
}
export function workflowMetadataCachePath(commonDir) { return join(commonDir, 'workflow-metadata-cache.json'); }
function githubMetadataPath() { return workflowMetadataCachePath(git('rev-parse', '--path-format=absolute', '--git-common-dir')); }
export function discoverGithubMetadata(repo) {
  const [owner, name] = repo.split('/');
  const counts = new Map(); let after; let project; let reviewQueue;
  const query = 'query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){issues(states:OPEN,first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{projectItems(first:10){nodes{project{number title owner{... on Organization{login} ... on User{login}}}}}}}}}';
  try {
    do {
      const args = ['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`];
      if (after) args.push('-F', `after=${after}`);
      const issues = afkGh(args).data.repository.issues;
      for (const item of issues.nodes.flatMap(issue => issue.projectItems.nodes)) {
        const current = counts.get(item.project.number) || { number: item.project.number, title: item.project.title, owner: item.project.owner?.login, count: 0 };
        current.count++;
        counts.set(current.number, current);
      }
      after = issues.pageInfo.hasNextPage ? issues.pageInfo.endCursor : null;
    } while (after);
    const projects = [...counts.values()].sort((a, b) => b.count - a.count);
    project = projects.length && (projects.length === 1 || projects[0].count > projects[1].count)
      ? { number: projects[0].number, title: projects[0].title, ...(projects[0].owner ? { owner: projects[0].owner } : {}) }
      : null;
  } catch { /* Project scope or API access can be unavailable; AFK remains usable without board priority. */ }
  try {
    const matches = afkGh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', 'in:title "Review queue"', '--limit', '100', '--json', 'number,title'])
      .filter(issue => issue.title.trim().toLowerCase() === 'review queue');
    reviewQueue = matches.length === 1 ? matches[0].number : null;
  } catch { /* A missing optional queue does not block implementation. */ }
  return { ...(project !== undefined ? { project } : {}), ...(reviewQueue !== undefined ? { reviewQueue } : {}) };
}
function cachedGithubMetadata(repo, refresh = false) {
  return readThroughLocalCache(githubMetadataPath(), repo, () => discoverGithubMetadata(repo), {
    ttlMs: workflowDefaults.github.metadataCacheHours * 3_600_000, refresh, expectedFields: ['project', 'reviewQueue'],
  });
}
export function applyGithubMetadata(cfg, metadata) {
  cfg.project ??= metadata.project;
  cfg.reviewQueue ??= metadata.reviewQueue;
  return cfg;
}
function afkFlags(args, allowed) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!allowed.includes(key) || !args[i + 1] || Object.hasOwn(result, key)) throw new Error(`Expected ${allowed.join(' ')}`);
    result[key] = args[i + 1];
  }
  return result;
}
function afkActor(cfg) {
  const actor = afkGh(['api', 'user']).login;
  if (!cfg.implementer || actor?.toLowerCase() !== cfg.implementer.toLowerCase()) throw new Error(`Authenticated as ${actor || 'unknown'}; AFK writes require ${cfg.implementer || 'a configured implementer'}`);
}
function afkConfig(refreshMetadata = false) {
  git('fetch', '--quiet', 'origin');
  const { lanes, baseRef } = config();
  if (!lanes.repo || !lanes.implementer || !lanes.reviewer) throw new Error('Configure identities.implementer; repo and review roles come from Git and CODEOWNERS');
  assertDistinctPushRoles({ owner: lanes.owner, implementer: lanes.implementer, reviewer: lanes.reviewer });
  for (const [key, value] of Object.entries(workflowDefaults.afk)) lanes[key] ??= value;
  lanes.serviceLabel ??= `dev.workflow.afk.${lanes.repo.replace('/', '.')}`;
  if (!Number.isSafeInteger(lanes.maxRuns) || lanes.maxRuns < 1) throw new Error('afk.maxRuns must be a positive integer');
  lanes.explore ??= {};
  for (const [key, value] of Object.entries(workflowDefaults.explore)) lanes.explore[key] ??= value;
  lanes.refreshMetadata = refreshMetadata;
  if (typeof lanes.runPrefix !== 'string' || !lanes.runPrefix.trim()) throw new Error('afk.runPrefix must be a non-empty string');
  for (const key of ['runsCommand', 'startCommand', 'stopCommand']) {
    if (lanes[key] === undefined && key !== 'startCommand') continue;
    if (!Array.isArray(lanes[key]) || !lanes[key].length || !lanes[key].every(value => typeof value === 'string' && value.length)) throw new Error(`Configure afk.${key} as a non-empty argv array`);
  }
  lanes.base = lanes.base || baseRef.slice('refs/remotes/origin/'.length);
  if (typeof lanes.environmentFile !== 'string' || !lanes.environmentFile.trim()) throw new Error('afk.environmentFile must be a non-empty string');
  if (lanes.startCommand.some(value => value.includes('{model}')) && (typeof lanes.model !== 'string' || !lanes.model.trim())) throw new Error('Configure afk.model because startCommand uses {model}');
  if (lanes.startCommand.some(value => value.includes('{permissionMode}')) && (typeof lanes.permissionMode !== 'string' || !lanes.permissionMode.trim())) throw new Error('Configure afk.permissionMode because startCommand uses {permissionMode}');
  if (lanes.promptPrefix !== undefined && typeof lanes.promptPrefix !== 'string') throw new Error('Configure afk.promptPrefix as a string');
  if (!Number.isSafeInteger(lanes.watchIntervalSeconds) || lanes.watchIntervalSeconds < 15) throw new Error('Configure afk.watchIntervalSeconds as an integer of at least 15');
  if (lanes.runsCommand && (!Number.isSafeInteger(lanes.waitTimeoutMinutes) || lanes.waitTimeoutMinutes < 1)) throw new Error('Configure afk.waitTimeoutMinutes as a positive integer when afk.runsCommand is set');
  if (lanes.runsCommand && (!lanes.stopCommand || typeof lanes.stateFile !== 'string' || !lanes.stateFile.includes('{id}'))) throw new Error('Configure afk.stopCommand and afk.stateFile with {id} when afk.runsCommand is set');
  if (!lanes.startCommand.some(value => value.includes('{runId}')) || !lanes.startCommand.some(value => value.includes('{prompt}'))) throw new Error('afk.startCommand must include {runId} and {prompt}');
  if (typeof lanes.serviceLabel !== 'string' || !/^[A-Za-z0-9.-]+$/.test(lanes.serviceLabel)) throw new Error('Configure afk.serviceLabel');
  lanes.pluginUpdateCommands ??= [];
  if (!Array.isArray(lanes.pluginUpdateCommands) || !lanes.pluginUpdateCommands.every(argv => Array.isArray(argv) && argv.length && argv.every(value => typeof value === 'string' && value))) throw new Error('Configure afk.pluginUpdateCommands as an array of argv arrays');
  if (lanes.pluginUpdateCommands.length && (!Number.isSafeInteger(lanes.pluginUpdateIntervalMinutes) || lanes.pluginUpdateIntervalMinutes < 1)) throw new Error('Configure afk.pluginUpdateIntervalMinutes');
  run('git', ['check-ref-format', '--branch', lanes.base]);
  return lanes;
}
function withRepoLock(name, action) {
  if (!heldWorkflowLocks.has(name)) throw new Error(`Workflow lock ${name} must be acquired by the CLI entry point`);
  return action();
}
export function afkLive(cfg) {
  if (!cfg.runsCommand) {
    try {
      const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
      const ledger = afkReadLedger(join(common, 'afk-holds.json'));
      return afkOneShotLive(ledger);
    } catch { return []; }
  }
  const output = run(cfg.runsCommand[0], cfg.runsCommand.slice(1));
  const agents = JSON.parse(output || '[]');
  return agents.filter(a => a.kind === 'background' && (a.name || '').startsWith(cfg.runPrefix) && !['idle', 'done', 'stopped', 'failed'].includes(a.state || a.status)).map(a => a.name);
}
export function afkOneShotLive(ledger, isAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } }) {
  return Object.entries(ledger).filter(([, holds]) => holds.some(hold => hold.oneShot && Number.isSafeInteger(hold.watcherPid) && isAlive(hold.watcherPid))).map(([id]) => id);
}
export const workflowLabels = {
  'lane:afk': ['1d76db', 'Approved for unattended work'],
  'lane:proposed': ['8250df', 'Awaiting automated AFK eligibility review'],
  'lane:owner': ['d93f0b', 'Requires owner participation to decide or implement'],
  'state:claimed': ['fbca04', 'An AFK run is working on this'],
  'state:started': ['fef2c0', 'An attended session is working on this'],
  'review:owner': ['e99695', 'PR is waiting for owner approval'],
  'type:epic': ['3e4b9e', 'Parent of bounded work items'],
  'type:story': ['a2eeef', 'New or changed user-visible behavior'],
  'type:bug': ['d73a4a', 'A fix for something that does not work as specified'],
  'type:chore': ['cfd3d7', 'Code change with no new user-visible behavior'],
  'type:task': ['c5def5', 'Work that ends in a finding or setting'],
};
function afkComments(cfg, issue) { return afkGh(['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${issue}/comments`]).flat(); }
function afkIssues(cfg) {
  const [owner, name] = cfg.repo.split('/');
  const fields = 'number title body lastEditedAt labels(first:30){nodes{name}} blockedBy(first:30){nodes{state}} milestone{number dueOn} parent{number parent{number parent{number parent{number}}}}';
  const query = withPriority => `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){issues(states:OPEN,first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{${fields}${withPriority ? ' projectItems(first:10){nodes{project{number} fieldValueByName(name:"Priority"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}' : ''}}}}}`;
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
      const priority = issue.projectItems?.nodes.find(card => card.project.number === cfg.project?.number)?.fieldValueByName?.name || 'P9';
      const ancestors = []; let parent = issue.parent;
      while (parent) { ancestors.push(parent.number); parent = parent.parent; }
      const scope = /```scope[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(issue.body || '');
      let paths = null;
      try {
        const parsed = scope ? JSON.parse(scope[1]).paths : null;
        if (Array.isArray(parsed) && parsed.length && parsed.every(value => typeof value === 'string' && value.trim() && value.trim() !== '.')) paths = parsed.map(value => value.startsWith('./') ? value.slice(2) : value.replace(/^\//, ''));
      } catch { /* An invalid scope packet is treated as a whole-epic unit. */ }
      return { ...issue, labels, priority, ancestors, paths, blocked: issue.blockedBy.nodes.some(dep => dep.state === 'OPEN') };
    }));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return found;
}
export function afkPriority(value) { return ({ P0: 0, P1: 1, P2: 2 })[value] ?? 9; }
export function afkEpicOrder(a, b) {
  const am = a.milestone ? [0, a.milestone.dueOn || '9999', a.milestone.number] : [1, '', 0];
  const bm = b.milestone ? [0, b.milestone.dueOn || '9999', b.milestone.number] : [1, '', 0];
  return afkPriority(a.priority) - afkPriority(b.priority) || am[0] - bm[0] || String(am[1]).localeCompare(String(bm[1])) || Number(am[2]) - Number(bm[2]) || a.number - b.number;
}
function afkPrData(cfg) {
  return afkGh(['pr', 'list', '--repo', cfg.repo, '--state', 'open', '--limit', '1000', '--json', 'number,title,body,headRefOid,labels,reviews,isDraft,statusCheckRollup,mergeable']);
}
export function afkPrRecord(pr, cfg) {
  const issues = [...new Set([...(pr.body || '').matchAll(/(?<![\w/])#(\d+)\b/g)].map(match => Number(match[1])))];
  const reviews = pr.reviews || [];
  const mine = reviews.filter(review => review.author?.login?.toLowerCase() === cfg.reviewer.toLowerCase());
  const latest = mine.at(-1); const head = pr.headRefOid;
  const ownerLane = pr.labels.some(label => label.name === 'review:owner');
  const approved = Boolean(latest?.state === 'APPROVED' && latest.commit?.oid === head && latest.body?.includes(`sha=${head}`) && latest.body?.includes(`verdict=${ownerLane ? 'owner' : 'ready'}`) &&
    !mine.some(review => review.state === 'CHANGES_REQUESTED' && review.commit?.oid === head));
  const ownerMine = reviews.filter(review => review.author?.login?.toLowerCase() === cfg.owner?.toLowerCase()).at(-1);
  const ownerApproved = Boolean(cfg.owner && ownerMine?.state === 'APPROVED' && ownerMine.commit?.oid === head);
  const reviewerReviewedHead = mine.some(review => review.commit?.oid === head);
  const checks = pr.statusCheckRollup || [];
  const failed = checks.some(check => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes((check.conclusion || check.state || '').toUpperCase()));
  const broken = pr.mergeable === 'CONFLICTING' || failed;
  const awaitingReview = !reviewerReviewedHead;
  const needsWork = broken || awaitingReview || (!pr.labels.some(label => label.name === 'review:owner') && !approved);
  return { ...pr, issues, approved, ownerApproved, awaitingReview, broken, needsWork };
}
export function afkPlan(cfg, live, threads, me = '', data = null) {
  const issues = data?.issues || afkIssues(cfg); const prs = (data?.prs || afkPrData(cfg)).map(pr => afkPrRecord(pr, cfg));
  const byNumber = new Map(issues.map(issue => [issue.number, issue]));
  const epics = issues.filter(issue => issue.labels.includes('type:epic')).sort(afkEpicOrder).map(issue => ({ issue, units: [] }));
  const epicNumbers = new Set(epics.map(epic => epic.issue.number));
  const epicOf = number => (byNumber.get(number)?.ancestors || []).find(parent => epicNumbers.has(parent));
  const firstEpic = epics[0]?.issue.number;
  const inPr = new Set(prs.flatMap(pr => pr.issues));
  const claimedElsewhere = number => {
    const claim = (threads(number).map(comment => /<!-- afk-claim session=(\S+) -->/.exec(comment.body || '')?.[1]).filter(Boolean).at(-1));
    return Boolean(claim && claim !== me && live.includes(claim));
  };
  const awaitsEligibility = issue => {
    const comments = threads(issue.number);
    const approvals = comments.filter(comment => comment.user?.login?.toLowerCase() === cfg.reviewer.toLowerCase() && /<!-- agent-review (?:(?:afk-)?eligibility\b|[^>]*\bissue=\d+)/.test(comment.body || '')).map(comment => comment.created_at);
    const latest = approvals.at(-1);
    return !latest || issue.lastEditedAt > latest || comments.some(comment => comment.created_at > latest && comment.user?.login?.toLowerCase() !== cfg.reviewer.toLowerCase());
  };
  for (const epic of epics) for (const issue of issues) {
    const owner = epicOf(issue.number);
    if (issue.labels.includes('type:epic') || (owner || firstEpic) !== epic.issue.number || inPr.has(issue.number)) continue;
    const suffix = owner ? '' : ' under no epic';
    if (issue.labels.includes('lane:proposed') && awaitsEligibility(issue)) epic.units.push({ text: `#${issue.number} awaits its AFK eligibility check${suffix}`, issue: issue.number, paths: [] });
    else if (issue.labels.includes('lane:afk') && !issue.blocked && !claimedElsewhere(issue.number)) epic.units.push({ text: `#${issue.number} is ready${suffix}`, issue: issue.number, paths: issue.paths || [] });
  }
  const heldOnEpic = number => threads(number).some(comment => {
    const id = /<!-- afk-epic-hold session=(\S+) -->/.exec(comment.body || '')?.[1];
    return Boolean(id && id !== me && live.includes(id));
  });
  for (const pr of prs) {
    if (!pr.needsWork) continue;
    const stories = pr.issues.map(number => byNumber.get(number)).filter(issue => issue && !issue.labels.includes('type:epic'));
    const parked = !pr.awaitingReview && !pr.broken && stories.length > 0 && stories.every(issue => issue.labels.includes('lane:owner'));
    if (parked) continue;
    const owners = pr.issues.map(epicOf).filter(Boolean);
    if (owners.length && pr.issues.some(number => epicOf(number) && claimedElsewhere(number))) continue;
    const target = owners[0] || firstEpic;
    const suffix = owners.length ? '' : ' (under no epic)';
    const paths = stories.flatMap(issue => issue.paths || []);
    const unit = pr.awaitingReview && !pr.broken
      ? { text: `PR #${pr.number} (${pr.title})${suffix} awaits its review`, issue: pr.number, paths: [] }
      : { text: `PR #${pr.number} (${pr.title})${suffix}${pr.broken ? ' has a red check or a conflict' : ''}`, issue: stories[0]?.number || pr.number, paths };
    const parent = epics.find(epic => epic.issue.number === target);
    if (parent) parent.units.push(unit);
  }
  return { epics, prs, byNumber, threads, claimedElsewhere, heldOnEpic };
}
export function* afkCandidates(epics, others, share, heldElsewhere) {
  const taken = new Set(others.map(hold => hold.number));
  const busy = new Set(others.map(hold => hold.epic));
  const whole = new Set(others.filter(hold => hold.paths === null).map(hold => hold.epic));
  for (const epic of epics) {
    const number = epic.issue.number;
    if (!epic.units.length || whole.has(number) || heldElsewhere(number)) continue;
    for (const unit of epic.units) {
      if (!share) {
        if (!busy.has(number)) yield { number, epic: number, paths: null, unit };
        break;
      }
      if (!taken.has(unit.issue)) yield { number: unit.issue, epic: number, paths: unit.paths, unit };
    }
  }
}
export function afkLiveHolds(comments, live, me) {
  const holds = [];
  for (const comment of comments) for (const match of (comment.body || '').matchAll(/<!-- afk-(epic|issue)-hold session=(\S+) -->/g)) {
    if (match[2] === me || live.includes(match[2])) holds.push({ comment: comment.id, run: match[2], kind: match[1] });
  }
  return holds.sort((a, b) => Number(a.comment) - Number(b.comment));
}
function afkHold(cfg, live, me, number, kind) {
  const comments = afkComments(cfg, number);
  if (afkLiveHolds(comments, live, me).some(hold => hold.run !== me)) return null;
  const created = afkGh(['api', `repos/${cfg.repo}/issues/${number}/comments`, '-f', `body=${afkMarker(`${kind}-hold`, me)}\nAn AFK run works on this ${kind}; it releases this hold when it ends.`]);
  const current = afkLiveHolds(afkComments(cfg, number), live, me);
  if (current.length && current[0].run !== me) {
    run('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${created.id}`, '-f', `body=${afkMarker(`${kind}-released`, me)}`]);
    return null;
  }
  return created.id;
}
function afkReadLedger(path) {
  try { const data = JSON.parse(readFileSync(path, 'utf8')); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; }
  catch { return {}; }
}
function afkWriteLedger(path, ledger) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(ledger)); renameSync(temp, path);
}
export function afkOtherHolds(ledger, live, me, now = Date.now()) {
  for (const [id, holds] of Object.entries(ledger)) {
    if (id === me) continue;
    if (live.includes(id)) for (const hold of holds) delete hold.gone;
    else if (!holds.length || now - Math.min(...holds.map(hold => hold.gone || (hold.gone = now))) >= 600_000) delete ledger[id];
  }
  return Object.entries(ledger).filter(([id]) => id !== me).flatMap(([, holds]) => holds);
}
function afkThreadReader(cfg) {
  const cache = new Map();
  return number => {
    if (!cache.has(number)) cache.set(number, afkComments(cfg, number));
    return cache.get(number);
  };
}
export function afkShow(held, epics, out, quiet = false) {
  const epic = epics.find(item => item.issue.number === held.epic);
  let units = epic?.units || [];
  const heading = `Hold: ${held.paths !== null ? `issue #${held.number} in epic #${held.epic}` : `epic #${held.number}`} (comment ${held.comment})`;
  if (held.paths !== null) {
    units = units.filter(unit => unit.issue === held.number);
  }
  const lines = [heading, ...out, ...units.map(unit => `Work: ${unit.text}`)];
  if (quiet) return lines.join('\n');
  for (const line of lines) console.log(line);
  return 0;
}
function afkPreflight(cfg) {
  const remote = git('remote', 'get-url', '--push', 'origin');
  let validRemote = false;
  try { const url = new URL(remote); validRemote = url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.replace(/^\//, '').replace(/\.git$/, '').toLowerCase() === cfg.repo.toLowerCase(); } catch {}
  if (!validRemote) throw new Error(`origin pushes to ${remote}; configure it for https://github.com/${cfg.repo}`);
  const actor = afkGh(['api', 'user']).login;
  if (actor?.toLowerCase() !== cfg.implementer.toLowerCase()) throw new Error(`gh acts as ${actor || 'nobody'}; AFK requires ${cfg.implementer}`);
  const reviewerToken = spawnSync('gh', ['auth', 'token', '--user', cfg.reviewer], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (reviewerToken.status !== 0) throw new Error(`No gh login for ${cfg.reviewer}; authenticate that reviewer account`);
  const permissions = afkGh(['api', `repos/${cfg.repo}`]).permissions || {};
  if (permissions.admin || permissions.maintain) throw new Error(`${actor} has admin or maintain permission on ${cfg.repo}; the AFK implementer must not have merge authority`);
}
function afkBudget() {
  const result = spawnSync('gh', ['api', 'rate_limit', '--jq', '.resources.graphql | [.remaining, .reset] | @tsv'], { encoding: 'utf8' });
  const [remaining, reset] = (result.stdout || '').trim().split(/\s+/).map(Number);
  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) return { remaining: 1000, reset: '' };
  return { remaining, reset: new Date(reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
}
function afkSignal(cfg, live) {
  const event = run('gh', ['api', `repos/${cfg.repo}/events?per_page=1`, '--jq', '.[0].id // empty']);
  const checks = run('gh', ['api', `repos/${cfg.repo}/actions/runs?per_page=10`, '--jq', '[.workflow_runs[] | "\\(.id):\\(.status):\\(.conclusion)"] | join(",")']);
  return `${event} ${checks} ${live.slice().sort().join(' ')}`;
}
function afkMoveCard(cfg, cardId, column) {
  const project = cfg.project;
  if (!project?.number) return false;
  const owner = project.owner;
  if (!owner) throw new Error('Cached GitHub Project is missing its owner; run `workflow.mjs cache refresh`');
  const fields = afkGh(['project', 'field-list', String(project.number), '--owner', owner, '--format', 'json']).fields;
  const field = fields.find(item => item.name === 'Status');
  const option = field?.options.find(item => item.name.toLowerCase() === column.toLowerCase());
  if (!field || !option) return false;
  const result = spawnSync('gh', ['project', 'item-edit', '--project-id', run('gh', ['project', 'view', String(project.number), '--owner', owner, '--format', 'json', '--jq', '.id']), '--id', cardId, '--field-id', field.id, '--single-select-option-id', option.id], { encoding: 'utf8' });
  if (result.status !== 0) {
    const scopeFailure = githubScopeFailure(result.stderr || '');
    if (scopeFailure) throw new Error(scopeFailure);
  }
  return result.status === 0;
}
function afkFinishPrCards(cfg) {
  if (!cfg.project?.number) return [];
  const [owner, name] = cfg.repo.split('/');
  const query = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(states:[MERGED,CLOSED],first:30,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number projectItems(first:10){nodes{id project{number} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}}';
  let nodes;
  try { nodes = afkGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`]).data.repository.pullRequests.nodes; }
  catch (error) {
    if (!missingProjectScope(error)) throw error;
    console.error('Closed PR board statuses skipped: token lacks project scope; continuing AFK work.');
    return [];
  }
  const moved = [];
  try {
    for (const pr of nodes) for (const item of pr.projectItems.nodes) {
      if (item.project.number === cfg.project.number && item.fieldValueByName?.name !== 'Done' && afkMoveCard(cfg, item.id, 'Done')) moved.push(pr.number);
    }
  } catch (error) {
    if (!missingProjectScope(error)) throw error;
    console.error('Closed PR board statuses skipped: token lacks project scope; continuing AFK work.');
  }
  return moved;
}
function afkExploreDue(cfg, live, currentRun = null) {
  const hours = Number(cfg.explore?.idleHours);
  if (!Number.isFinite(hours) || hours <= 0 || live.some(id => id !== currentRun)) return false;
  const path = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'afk-idle-explore.json');
  try {
    const previous = JSON.parse(readFileSync(path, 'utf8'));
    if (previous.session && previous.session !== currentRun && live.includes(previous.session)) return false;
    return Date.now() - Number(previous.started || 0) >= hours * 3_600_000;
  }
  catch { return true; }
}
function afkStatus(cfg, issue, value, silent = false) {
  const statusNames = { BACKLOG: 'Backlog', TODO: 'Todo', PROGRESS: 'In progress', REVIEW: 'Review', DONE: 'Done' };
  const target = statusNames[value];
  const project = cfg.project;
  if (!target || !project?.number) {
    if (silent) return false;
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
  const issueData = afkGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${org}`, '-F', `name=${name}`, '-F', `number=${issue}`]).data.repository.issue;
  let card = issueData?.projectItems?.nodes?.find(item => item.project.id === id);
  if (!card && silent) return false;
  if (!card) {
    const url = `https://github.com/${cfg.repo}/issues/${issue}`;
    card = { id: run('gh', ['project', 'item-add', String(project.number), '--owner', owner, '--url', url, '--format', 'json', '--jq', '.id']) };
  }
  const final = issueData.state === 'CLOSED' ? 'Done' : target;
  const field = afkGh(['project', 'field-list', String(project.number), '--owner', owner, '--format', 'json']).fields.find(item => item.name === 'Status');
  const option = field?.options.find(item => item.name.toLowerCase() === final.toLowerCase());
  if (!option) {
    if (silent) return false;
    throw new Error(`Project is missing Status option ${final}`);
  }
  run('gh', ['project', 'item-edit', '--project-id', id, '--id', card.id, '--field-id', field.id, '--single-select-option-id', option.id]);
  if (!silent) console.log(`#${issue} → ${final}`);
  } catch (error) {
    if (!silent || !missingProjectScope(error)) throw error;
    console.error(`Board status for #${issue} not updated: token lacks project scope; continuing AFK work.`);
    return false;
  }
}
function afkQueue(args) {
  const o = afkFlags(args, ['--kind', '--number', '--text']);
  const heading = { waiting: 'Waiting for the owner', decision: 'Decisions you may challenge' }[o['--kind']];
  if (!heading || !/^[1-9]\d*$/.test(o['--number'] || '') || !o['--text']?.trim() || o['--text'].length > 500 || /[\r\n]/.test(o['--text'])) throw new Error('Queue requires waiting|decision, an issue number and one-line text (max 500 chars)');
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
  if (!Number.isInteger(cfg.reviewQueue)) throw new Error('No open issue titled "Review queue" was discovered; create one, then run `workflow.mjs cache refresh`');
  return withRepoLock('afk-queue', () => {
    const queue = afkGh(['issue', 'view', String(cfg.reviewQueue), '--repo', cfg.repo, '--json', 'title,state,body']);
    if (queue.title?.trim().toLowerCase() !== 'review queue' || queue.state !== 'OPEN') throw new Error('Cached Review queue issue is no longer open or its title changed; run `workflow.mjs cache refresh`');
    const body = queue.body || '';
    const lines = body.split('\n'); const start = lines.findIndex(line => line.replace(/^#+\s*/, '').trim().toLowerCase() === heading.toLowerCase());
    if (start < 0) throw new Error(`Review queue is missing ${heading}`);
    let end = lines.findIndex((line, i) => i > start && /^#{1,6}\s/.test(line)); if (end < 0) end = lines.length;
    const n = Number(o['--number']); const entry = `#${n}: ${o['--text'].trim()}`;
    const existing = lines.findIndex((line, i) => i > start && i < end && new RegExp(`^(?:\\d+\\. |- )#${n}\\b`).test(line));
    if (existing >= 0) lines[existing] = `${lines[existing].match(/^(?:\d+\. |- )/)[0]}${entry}`;
    else lines.splice(end, 0, o['--kind'] === 'waiting' ? `${lines.slice(start + 1, end).filter(line => /^\d+\. /.test(line)).length + 1}. ${entry}` : `- ${entry}`);
    run('gh', ['issue', 'edit', String(cfg.reviewQueue), '--repo', cfg.repo, '--body', lines.join('\n')]);
    if (!afkGh(['issue', 'view', String(cfg.reviewQueue), '--repo', cfg.repo, '--json', 'body']).body.includes(entry)) throw new Error(`Queue verification failed for #${n}`);
    console.log(`Queued #${n} under ${o['--kind']}`);
  });
}
function issueClaim(args, lanes) {
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
function issueStatus(args, lanes) {
  const o = afkFlags(args, ['--number', '--value']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1) throw new Error('Usage: issue status --number N --value STATUS');
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg); afkStatus(cfg, n, (o['--value'] || '').toUpperCase());
}
function issueComment(args) {
  const o = afkFlags(args, ['--number', '--body-file']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1 || !o['--body-file']) throw new Error('Usage: issue comment --number N --body-file PATH');
  const root = git('rev-parse', '--show-toplevel');
  const body = validateIssueCommentBody(readFileSync(workspaceFilePath(root, o['--body-file']), 'utf8'));
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
  return withRepoLock(`issue-comment-${n}`, () => {
    const result = afkGh(['api', `repos/${cfg.repo}/issues/${n}/comments`, '-f', `body=${body}`]);
    if (!Number.isSafeInteger(result.id)) throw new Error(`GitHub did not confirm the comment on #${n}`);
    console.log(`Commented on #${n} (${result.id})`);
  });
}
function issueClose(args) {
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
function issueQueue(args, lanes) { afkQueue(args); }
function afkPrs(cfg) {
  return afkPrData(cfg);
}
function afkMerge(cfg, prs, wanted = null) {
  const messages = [];
  for (const pr of prs) {
    if (wanted && !wanted.has(pr.number)) continue;
    const checks = pr.statusCheckRollup || [];
    const passed = checks.length && checks.every(c => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes((c.conclusion || c.state || '').toUpperCase()));
    if (pr.isDraft) {
      if (passed && pr.mergeable === 'MERGEABLE') { run('gh', ['pr', 'ready', String(pr.number), '--repo', cfg.repo]); messages.push(`PR #${pr.number} marked ready`); }
      continue;
    }
    const mine = (pr.reviews || []).filter(r => r.author?.login?.toLowerCase() === cfg.reviewer.toLowerCase());
    const latest = mine.at(-1); const head = pr.headRefOid;
    const ownerLane = pr.labels?.some(l => l.name === 'review:owner');
    const ownerReviews = (pr.reviews || []).filter(r => r.author?.login?.toLowerCase() === cfg.owner?.toLowerCase());
    const ownerLatest = ownerReviews.at(-1);
    const approved = latest?.state === 'APPROVED' && latest.commit?.oid === head && latest.body?.includes(`sha=${head}`) && latest.body?.includes(`verdict=${ownerLane ? 'owner' : 'ready'}`);
    const blocked = mine.some(r => r.state === 'CHANGES_REQUESTED' && r.commit?.oid === head);
    const ownerNeeded = ownerLane && !(ownerLatest?.state === 'APPROVED' && ownerLatest.commit?.oid === head);
    const failed = checks.some(c => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes((c.conclusion || c.state || '').toUpperCase()));
    if (!passed || !approved || blocked || ownerNeeded || failed || pr.mergeable === 'CONFLICTING') continue;
    const args = ['pr', 'merge', String(pr.number), '--repo', cfg.repo, '--squash', '--match-head-commit', head];
    const merged = spawnSync('gh', args, { encoding: 'utf8' });
    const queued = merged.status === 0 ? null : spawnSync('gh', [...args, '--auto'], { encoding: 'utf8' });
    messages.push(`PR #${pr.number} ${merged.status === 0 ? 'merged' : queued?.status === 0 ? 'will merge after checks' : 'merge refused'}`);
  }
  return messages;
}
function afkStartRun(cfg, id, common, requestedIssue = null, quiet = false, prepared = false) {
  const ledgerPath = join(common, 'afk-holds.json');
  const existing = afkReadLedger(ledgerPath)[id]?.[0];
  const resumingOneShot = !prepared && !cfg.runsCommand && Boolean(existing?.oneShot);
  if (!prepared) afkPreflight(cfg);
  const output = prepared || resumingOneShot ? [] : afkMerge(cfg, afkPrs(cfg));
  return withRepoLock('afk-start', () => {
    const ledger = afkReadLedger(ledgerPath);
    if (ledger[id]?.length) {
      if (requestedIssue && ledger[id][0].number !== requestedIssue) throw new Error(`Run ${id} already holds #${ledger[id][0].number}, not #${requestedIssue}`);
      const live = afkLive(cfg); const threads = afkThreadReader(cfg); const plan = afkPlan(cfg, live, threads, id);
      return afkShow(ledger[id][0], plan.epics, output, quiet);
    }
    const live = afkLive(cfg);
    const others = live.filter(runId => runId !== id);
    if (Number(cfg.maxRuns) > 0 && others.length >= Number(cfg.maxRuns)) {
      console.log(`Done: ${others.length} other runs are live, as many as afk.maxRuns allows.`);
      output.forEach(line => console.log(line)); return 3;
    }
    const threads = afkThreadReader(cfg);
    const { epics, heldOnEpic } = afkPlan(cfg, live, threads, id);
    const othersHolds = afkOtherHolds(ledger, live, id);
    afkWriteLedger(ledgerPath, ledger);
    const cap = Number(cfg.maxRuns) || 0;
    for (const candidate of afkCandidates(epics, othersHolds, Boolean(cap), heldOnEpic)) {
      if (requestedIssue && candidate.number !== requestedIssue) continue;
      const type = candidate.paths === null ? 'epic' : 'issue';
      const comment = afkHold(cfg, live, id, candidate.number, type);
      if (!comment) continue;
      const held = { number: candidate.number, epic: candidate.epic, paths: candidate.paths, comment, oneShot: prepared && !cfg.runsCommand, watcherPid: prepared && !cfg.runsCommand ? process.pid : undefined };
      ledger[id] = [...(ledger[id] || []), held];
      try {
        if (type === 'issue') afkStatus(cfg, held.number, 'PROGRESS', true);
        afkWriteLedger(ledgerPath, ledger);
      } catch (error) {
        spawnSync('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${comment}`, '-f', `body=${afkMarker(`${type}-released`, id)}\nStart failed; hold released.`], { stdio: 'ignore' });
        throw error;
      }
      return afkShow(held, epics, output, quiet);
    }
    if (requestedIssue) throw new Error(`#${requestedIssue} is not an eligible AFK candidate`);
    if (afkExploreDue(cfg, live, id)) {
      const explorePath = join(common, 'afk-idle-explore.json');
      const previous = (() => { try { return JSON.parse(readFileSync(explorePath, 'utf8')); } catch { return {}; } })();
      if (!previous.session || previous.session === id || !live.includes(previous.session)) {
        const temp = `${explorePath}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify({ session: id, started: Date.now() })); renameSync(temp, explorePath);
        console.log('Explore: no work is free for this run; play `explore` unattended.');
        output.forEach(line => console.log(line)); return 4;
      }
    }
    console.log('Done: every free piece of work has its runner.');
    output.forEach(line => console.log(line)); return 3;
  });
}
function afkCheckRun(cfg, common, quiet, result = {}, requestedIssue = null) {
  const live = afkLive(cfg); const statePath = quiet ? join(common, 'afk-check.json') : null;
  const signal = statePath ? afkSignal(cfg, live) : null;
  if (statePath) {
    try {
      const previous = JSON.parse(readFileSync(statePath, 'utf8'));
      if (previous.signal === signal && Date.now() - previous.at < 1_800_000) { result.start = 0; console.log('Quiet: nothing changed since the last check.'); return 3; }
    } catch {}
  }
  const budget = afkBudget();
  if (budget.remaining < 1000) { result.start = 0; console.log(`Quiet: GitHub GraphQL has ${budget.remaining} points until ${budget.reset}; live runs keep them.`); return 3; }
  afkPreflight(cfg);
  const output = afkMerge(cfg, afkPrs(cfg));
  for (const number of afkFinishPrCards(cfg)) output.push(`PR #${number}'s card moved to Done: the PR is merged or closed`);
  const threads = afkThreadReader(cfg);
  const { epics, heldOnEpic } = afkPlan(cfg, live, threads);
  const ledgerPath = join(common, 'afk-holds.json');
  let start = withRepoLock('afk-start', () => {
    const ledger = afkReadLedger(ledgerPath);
    const others = afkOtherHolds(ledger, live, '');
    const booting = live.filter(id => !ledger[id]?.length);
    const cap = Number(cfg.maxRuns) || 0;
    const slots = cap ? cap - live.length : epics.length;
    const chosen = [];
    for (const candidate of afkCandidates(epics, [...others, ...chosen], Boolean(cap), heldOnEpic)) {
      if (requestedIssue && candidate.number !== requestedIssue) continue;
      if (chosen.length >= Math.max(0, slots) + booting.length) break;
      chosen.push(candidate);
    }
    if (requestedIssue && !chosen.length) return 0;
    afkWriteLedger(ledgerPath, ledger);
    return Math.max(0, Math.min(slots, chosen.length - booting.length));
  });
  if (!requestedIssue && !start && !live.length && afkExploreDue(cfg, live)) start = 1;
  result.start = start;
  if (statePath) { mkdirSync(dirname(statePath), { recursive: true }); writeFileSync(statePath, JSON.stringify({ signal, at: Date.now() })); }
  console.log(start ? `Start: ${start}` : requestedIssue ? `Done: #${requestedIssue} has no free AFK assignment.` : `Done: no new run has work (${live.length} live).`);
  output.forEach(line => console.log(line));
  return start ? 0 : 3;
}
function afkEndRun(cfg, common, id) {
  afkActor(cfg);
  return withRepoLock('afk-start', () => {
    const path = join(common, 'afk-holds.json'); const ledger = afkReadLedger(path);
    const dropped = ledger[id] || []; delete ledger[id];
    const prs = dropped.some(hold => hold.paths !== null) ? afkPrData(cfg).map(pr => afkPrRecord(pr, cfg)) : [];
    const named = new Set(prs.flatMap(pr => pr.issues));
    for (const held of dropped) {
      const kind = held.paths === null ? 'epic' : 'issue';
      run('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${held.comment}`, '-f', `body=${afkMarker(`${kind}-released`, id)}`]);
      console.log(`Released: ${kind} #${held.number}`);
      if (kind === 'issue') afkStatus(cfg, held.number, named.has(held.number) ? 'REVIEW' : 'TODO', true);
    }
    const openEpics = afkIssues(cfg).filter(issue => issue.labels.includes('type:epic'));
    for (const epic of openEpics) for (const comment of afkComments(cfg, epic.number)) {
      if ((comment.body || '').includes(afkMarker('epic-hold', id))) {
        run('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${comment.id}`, '-f', `body=${afkMarker('epic-released', id)}`]);
        if (!dropped.some(hold => hold.comment === comment.id)) console.log(`Released: epic #${epic.number}`);
      }
    }
    afkWriteLedger(path, ledger);
    if (!dropped.length) console.log('Released: no issue hold');
    return 0;
  });
}
function afkExpandedPath(path) { return path.replace(/^~(?=\/|$)/, homedir()); }
export function afkWorkflowCliPath() { return realpathSync(fileURLToPath(import.meta.url)); }
export function afkLoadEnvironment(cfg) {
  for (const key of Object.keys(process.env)) {
    if (/^(GH_TOKEN|GITHUB_TOKEN|GH_HOST|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GIT_ASKPASS|SSH_ASKPASS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+|GIT_SSH|GIT_SSH_COMMAND|GIT_PROXY_COMMAND|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_NAMESPACE|GIT_CONFIG_PARAMETERS|GIT_CONFIG|GIT_EXEC_PATH|GIT_TRACE.*|GIT_CURL_VERBOSE|GIT_SSL_NO_VERIFY|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_INDEX_FILE|GIT_TEMPLATE_DIR)$/i.test(key)) delete process.env[key];
  }
  const file = afkExpandedPath(cfg.environmentFile);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  const env = value?.env;
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error(`${file} must contain an env object`);
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) {
    if (typeof env[key] === 'string' && env[key]) process.env[key] = env[key];
  }
  if (cfg.repo) applyGithubMetadata(cfg, cachedGithubMetadata(cfg.repo, cfg.refreshMetadata === true));
}
function afkConfiguredCommand(argv, replacements = {}, options = {}) {
  const values = argv.map(value => value.replace(/\{([A-Za-z]+)\}/g, (match, key) => {
    if (!Object.hasOwn(replacements, key)) throw new Error(`Unknown command placeholder ${match}`);
    return String(replacements[key]);
  }));
  const [program, ...args] = values;
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: afkAgentEnvironment(), ...options });
  if (result.error || result.status !== 0) throw new Error(`${program} ${args[0] || ''} failed`);
  return (result.stdout || '').trim();
}
function afkReap(cfg, common) {
  if (!cfg.runsCommand) return;
  const file = join(common, 'afk-prompt-waits.json'); let previous = {};
  try { previous = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  const agents = JSON.parse(run(cfg.runsCommand[0], cfg.runsCommand.slice(1)) || '[]')
    .filter(agent => agent.kind === 'background' && (agent.name || '').startsWith(cfg.runPrefix) && agent.id);
  const now = Date.now(), waiting = {}, stops = [];
  for (const agent of agents) {
    if (typeof agent.id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(agent.id)) continue;
    let ended = false;
    if (agent.status === 'idle') {
      try {
        const statePath = afkExpandedPath(cfg.stateFile.replaceAll('{id}', agent.id));
        ended = !JSON.parse(readFileSync(statePath, 'utf8')).inFlight?.tasks?.length;
      } catch {}
    }
    const reason = agent.waitingFor || (ended ? 'finished turn' : null);
    if (reason) waiting[agent.id] = previous[agent.id] || now;
    if (agent.state === 'done' || (agent.state === 'blocked' && !agent.waitingFor) || (reason && now - waiting[agent.id] >= cfg.waitTimeoutMinutes * 60_000)) stops.push(agent);
  }
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(waiting)); renameSync(temp, file);
  for (const agent of stops) {
    afkConfiguredCommand(cfg.stopCommand, { runId: agent.name || agent.id, id: agent.id });
    console.error(`stopped ${agent.name}: wait ended`);
  }
}
function afkWatchTree(cfg) {
  const root = git('rev-parse', '--show-toplevel');
  const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
  const watch = afkWatchPath(common);
  const marker = join(common, 'afk-watch-worktree.json');
  run('git', ['fetch', '--quiet', 'origin', cfg.base], { cwd: root, env: cleanEnvironment() });
  mkdirSync(dirname(watch), { recursive: true });
  if (!existsSync(watch)) {
    run('git', ['worktree', 'add', '--quiet', '--detach', watch, `origin/${cfg.base}`], { cwd: root, env: cleanEnvironment() });
    writeFileSync(marker, JSON.stringify({ common, watch: realpathSync(watch) }));
  } else {
    let actual;
    try { actual = realpathSync(run('git', ['rev-parse', '--show-toplevel'], { cwd: watch })); }
    catch { throw new Error(`${watch} exists but is not a Git worktree; preserve it and resolve manually`); }
    if (actual !== realpathSync(watch)) throw new Error(`${watch} resolves to another checkout`);
    const watchCommon = realpathSync(resolve(watch, run('git', ['rev-parse', '--git-common-dir'], { cwd: watch })));
    if (watchCommon !== common) throw new Error(`${watch} belongs to a different repository`);
    const attached = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: watch, encoding: 'utf8', env: cleanEnvironment() });
    if (attached.error || attached.status === 0) throw new Error(`${watch} has an attached branch; preserve it and resolve manually`);
    if (attached.status !== 1) throw new Error(`${watch} HEAD state is unreadable; preserve it and resolve manually`);
    let ownership;
    try { ownership = JSON.parse(readFileSync(marker, 'utf8')); } catch {}
    if (ownership && (ownership.common !== common || ownership.watch !== realpathSync(watch))) throw new Error(`${watch} does not match its CLI ownership record; preserve it and resolve manually`);
    const tracked = spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: watch, env: cleanEnvironment() });
    const staged = spawnSync('git', ['diff', '--cached', '--quiet', '--'], { cwd: watch, env: cleanEnvironment() });
    if (tracked.error || tracked.status !== 0 || staged.error || staged.status !== 0) throw new Error(`${watch} has tracked changes; preserve them and retry after cleanup`);
    const localOnly = run('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], { cwd: watch }).split('\0').filter(Boolean);
    const target = run('git', ['ls-tree', '-r', '--name-only', '-z', `origin/${cfg.base}`], { cwd: watch }).split('\0').filter(Boolean);
    const targetPaths = new Set();
    for (const trackedPath of target) {
      targetPaths.add(trackedPath);
      let parent = trackedPath;
      while (parent.includes('/')) { parent = parent.slice(0, parent.lastIndexOf('/')); targetPaths.add(parent); }
    }
    const collision = localOnly.find(path => targetPaths.has(path));
    if (collision) throw new Error(`${watch} has an untracked or ignored file that would collide with ${cfg.base}: ${collision}; preserve it and resolve manually`);
    if (!ownership) {
      writeFileSync(marker, JSON.stringify({ common, watch: realpathSync(watch) }));
      if (localOnly.length) console.log(`Adopted detached watcher and preserved ${localOnly.length} untracked or ignored path(s).`);
    }
    run('git', ['checkout', '--quiet', '--no-overwrite-ignore', '--detach', `origin/${cfg.base}`], { cwd: watch, env: cleanEnvironment() });
  }
  return watch;
}
function afkWatchPath(common) { return join(dirname(common), '.worktrees', 'afk-watch'); }
function plistText(xml, key) {
  const match = new RegExp(`<key>${key}<\\/key>\\s*<string>([\\s\\S]*?)<\\/string>`).exec(xml);
  return match?.[1].replaceAll('&apos;', "'").replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&') ?? null;
}
function plistArguments(xml) {
  const match = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(xml);
  return match ? [...match[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map(item => item[1].replaceAll('&apos;', "'").replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&')) : [];
}
export function afkPlistBelongsToWorkflow(xml, { label, launcher, executable, watchDirectory, repositoryRoot, allowLegacy = false }) {
  if (plistText(xml, 'Label') !== label) return false;
  const args = plistArguments(xml);
  if (args.length === 4 && args[0] === executable && args[1] === launcher && args[2] === 'afk' && args[3] === 'watch' && plistText(xml, 'WorkingDirectory') === watchDirectory) return true;
  return allowLegacy && args.length === 2 && basename(args[0] || '') === 'just' && args[1] === 'afk-watch' && plistText(xml, 'WorkingDirectory') === repositoryRoot;
}
function afkInstall(cfg) {
  if (process.platform !== 'darwin') throw new Error('afk install currently requires macOS launchd');
  afkLoadEnvironment(cfg);
  const watch = withRepoLock('afk-watch-tree', () => afkWatchTree(cfg));
  const cliPath = afkWorkflowCliPath();
  const label = cfg.serviceLabel;
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const launcher = join(common, 'afk-launch.mjs');
  const repositoryRoot = git('rev-parse', '--show-toplevel');
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  if (existsSync(plistPath)) {
    const existing = readFileSync(plistPath, 'utf8');
    if (!afkPlistBelongsToWorkflow(existing, { label, launcher, executable: process.execPath, watchDirectory: watch, repositoryRoot, allowLegacy: true })) throw new Error(`LaunchAgent ${label} already belongs to another service; preserve ${plistPath} and choose a unique afk.serviceLabel`);
  } else {
    const loaded = spawnSync('launchctl', ['print', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' });
    if (!loaded.error && loaded.status === 0) throw new Error(`LaunchAgent ${label} is already loaded without an owned plist; preserve it and choose a unique afk.serviceLabel`);
  }
  const launcherSource = `import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const cli = ${JSON.stringify(cliPath)};
try { readFileSync(cli); } catch { console.error('The workflow CLI is missing; reinstall the workflow package and retry'); process.exit(1); }
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
`;
  writeFileSync(launcher, launcherSource, { mode: 0o700 });
  const logPath = join(homedir(), 'Library', 'Logs', `${label}.log`);
  const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  const args = [process.execPath, launcher, 'afk', 'watch'];
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${xml(label)}</string>\n<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>\n<key>WorkingDirectory</key><string>${xml(watch)}</string>\n<key>EnvironmentVariables</key><dict><key>HOME</key><string>${xml(homedir())}</string><key>PATH</key><string>${xml(process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin')}</string></dict>\n<key>AbandonProcessGroup</key><true/><key>StartInterval</key><integer>${cfg.watchIntervalSeconds}</integer><key>RunAtLoad</key><true/>\n<key>StandardOutPath</key><string>${xml(logPath)}</string><key>StandardErrorPath</key><string>${xml(logPath)}</string>\n</dict></plist>\n`;
  mkdirSync(dirname(plistPath), { recursive: true });
  mkdirSync(dirname(logPath), { recursive: true });
  const temp = `${plistPath}.${process.pid}.tmp`;
  writeFileSync(temp, plist, { mode: 0o600 }); renameSync(temp, plistPath);
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' });
  run('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]);
  console.log(`Installed: ${label}; watcher worktree ${watch}`);
}
function afkUninstall(cfg) {
  if (process.platform !== 'darwin') throw new Error('afk uninstall currently requires macOS launchd');
  const label = cfg.serviceLabel;
  const plist = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const realCommon = realpathSync(common);
  const watch = afkWatchPath(realCommon);
  if (!existsSync(plist) || !afkPlistBelongsToWorkflow(readFileSync(plist, 'utf8'), { label, launcher: join(realCommon, 'afk-launch.mjs'), executable: process.execPath, watchDirectory: watch, repositoryRoot: git('rev-parse', '--show-toplevel') })) {
    throw new Error(`LaunchAgent ${label} is not an owned workflow watcher; preserve it and inspect ${plist}`);
  }
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' });
  rmSync(plist, { force: true });
  rmSync(join(common, 'afk-launch.mjs'), { force: true });
  console.log(`Uninstalled: ${label}. The watcher worktree is preserved.`);
}
function afkWatch(cfg, common, requestedIssue = null) {
  afkLoadEnvironment(cfg);
  const currentCli = afkWorkflowCliPath();
  const watchRoot = withRepoLock('afk-watch-tree', () => afkWatchTree(cfg));
  if (cfg.pluginUpdateCommands.length) {
    const stamp = join(common, 'afk-plugin-sync');
    let update = true;
    try { update = Date.now() - statSync(stamp).mtimeMs >= cfg.pluginUpdateIntervalMinutes * 60_000; } catch {}
    if (update) {
      writeFileSync(stamp, String(Date.now()));
      try {
        for (const command of cfg.pluginUpdateCommands) afkConfiguredCommand(command);
        rmSync(join(common, 'afk-check.json'), { force: true });
      } catch (error) { console.error(`plugin update failed; retry after ${cfg.pluginUpdateIntervalMinutes} minutes: ${error.message}`); }
    }
  }
  afkReap(cfg, common);
  const result = {};
  const code = afkCheckRun(cfg, common, true, result, requestedIssue);
  for (let i = 1; i <= (result.start || 0); i++) {
    const runId = `${cfg.runPrefix}${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${process.pid}-${i}`;
    const cliPath = currentCli;
    const issueArg = requestedIssue ? ` --issue ${requestedIssue}` : '';
    const assignment = cfg.runsCommand ? null : afkStartRun(cfg, runId, common, requestedIssue, true, true);
    const held = typeof assignment === 'string' && assignment.includes('Hold:');
    const prompt = `${cfg.promptPrefix ? `${cfg.promptPrefix}\n` : ''}Use the AFK skill for one unattended work slice. Run id: ${runId}.${held ? ` The workflow CLI already holds this assignment; use it as complete scope and do not call afk start or afk end.\n${assignment}` : ` Begin with: node ${cliPath} afk start --me ${runId}${issueArg}. End through the AFK skill's end step.`}`;
    let output;
    try {
      output = afkConfiguredCommand(cfg.startCommand, { runId, prompt, model: cfg.model, permissionMode: cfg.permissionMode, cliPath, repository: cfg.repo }, { cwd: watchRoot });
    } finally {
      if (held) afkEndRun(cfg, common, runId);
    }
    console.log(output ? `Completed: ${runId}\n${output}` : `Started: ${runId}`);
  }
  return code === 2 ? 2 : 0;
}
function afkCommand(args) {
  try {
    const [action, ...rest] = args;
    const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
    const cfg = afkConfig();
    afkLoadEnvironment(cfg);
    if (action === 'install') { afkInstall(cfg); return 0; }
    if (action === 'uninstall') { afkUninstall(cfg); return 0; }
    if (action === 'watch') {
      const flags = afkFlags(rest, ['--issue']);
      const issue = flags['--issue'] === undefined ? null : Number(flags['--issue']);
      if (issue !== null && (!Number.isSafeInteger(issue) || issue < 1)) throw new Error('afk watch --issue must be a positive issue number');
      return afkWatch(cfg, common, issue);
    }
    if (action === 'reap') { afkLoadEnvironment(cfg); afkReap(cfg, common); return 0; }
    if (action === 'runs') {
      afkLoadEnvironment(cfg);
      const agents = cfg.runsCommand ? JSON.parse(run(cfg.runsCommand[0], cfg.runsCommand.slice(1)) || '[]') : [];
      console.log(agents.filter(a => a.kind === 'background' && (a.name || '').startsWith(cfg.runPrefix) && !['idle', 'done', 'stopped', 'failed'].includes(a.state || a.status)).map(a => a.name).join('\n')); return 0;
    }
    if (action === 'merge') {
      afkActor(cfg);
      const wanted = rest.map(v => { if (!/^[1-9]\d*$/.test(v)) throw new Error(`Invalid PR number: ${v}`); return Number(v); });
      console.log(afkMerge(cfg, afkPrs(cfg), wanted.length ? new Set(wanted) : null).join('\n') || 'Merged nothing.'); return 0;
    }
    if (action === 'start') {
      const flags = afkFlags(rest, ['--me', '--issue']); const id = flags['--me'];
      if (!/^[\w.-]+$/.test(id || '')) throw new Error('Usage: afk start --me RUN_ID');
      const issue = flags['--issue'] === undefined ? null : Number(flags['--issue']);
      if (issue !== null && (!Number.isSafeInteger(issue) || issue < 1)) throw new Error('afk start --issue must be a positive issue number');
      return afkStartRun(cfg, id, common, issue);
    }
    if (action === 'check') {
      if (rest.some(value => value !== '--quiet')) throw new Error('Usage: afk check [--quiet]');
      return afkCheckRun(cfg, common, rest.includes('--quiet'));
    }
    if (action === 'end') {
      const id = afkFlags(rest, ['--me'])['--me'];
      if (!/^[\w.-]+$/.test(id || '')) throw new Error('Usage: afk end --me RUN_ID');
      return afkEndRun(cfg, common, id);
    }
    throw new Error('Usage: afk <install|uninstall|watch|start|check|merge|end|runs|reap>');
  } catch (error) { console.error(`Blocked: ${error.message}; resolve the cause and retry.`); return 2; }
}
function requiredLocks(command, args) {
  if (command === 'issue') {
    if (args[0] === 'queue') return ['afk-queue'];
    if (args[0] === 'status') return ['afk-start'];
    if (args[0] === 'claim') {
      const index = args.indexOf('--number');
      return index >= 0 && /^[1-9]\d*$/.test(args[index + 1] || '') ? [`claim-${args[index + 1]}`] : [];
    }
    if (['comment', 'close'].includes(args[0])) {
      const index = args.indexOf('--number');
      return index >= 0 && /^[1-9]\d*$/.test(args[index + 1] || '') ? [`issue-${args[0]}-${args[index + 1]}`] : [];
    }
  }
  if (command === 'afk') {
    if (['start', 'check', 'merge', 'end'].includes(args[0])) return ['afk-start'];
    if (['install', 'uninstall'].includes(args[0])) return ['afk-watch-tree'];
    if (args[0] === 'reap') return ['afk-reap'];
    if (args[0] === 'watch') return ['afk-start', 'afk-reap', 'afk-watch-tree'];
  }
  return [];
}
function oneShotLedgerRun(command, args) {
  if (command !== 'afk' || !['start', 'end'].includes(args[0])) return null;
  try {
    const id = oneShotRunId(args[0], args.slice(1));
    if (!/^[\w.-]+$/.test(id || '')) return null;
    const { root, lanes } = config();
    if (lanes.runsCommand) return null;
    const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
    return afkReadLedger(join(common, 'afk-holds.json'))[id]?.some(hold => hold.oneShot) ? id : null;
  } catch { return null; }
}
export function oneShotRunId(action, args) {
  if (action === 'start') return afkFlags(args, ['--me', '--issue'])['--me'];
  if (action !== 'end') return null;
  const indexes = args.flatMap((value, index) => value === '--me' ? [index] : []);
  return indexes.length === 1 ? args[indexes[0] + 1] : null;
}
export function hasProcessAncestor(processes, pid, ownerPid, maxDepth = 16) {
  for (let depth = 0; pid && depth < maxDepth; depth++) {
    if (pid === ownerPid) return true;
    const parent = processes.get(pid);
    if (!parent) return false;
    pid = parent.parent;
  }
  return false;
}
function oneShotWatcherActive(id) {
  try {
    const { root } = config();
    const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
    const hold = afkReadLedger(join(common, 'afk-holds.json'))[id]?.[0];
    const ownerPid = hold?.watcherPid;
    if (!hold?.oneShot || !Number.isSafeInteger(ownerPid)) return false;
    const result = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
    if (result.error || result.status !== 0) return false;
    const processes = new Map();
    for (const line of result.stdout.split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (match) processes.set(Number(match[1]), { parent: Number(match[2]), command: match[3] });
    }
    if (!processes.get(ownerPid)?.command.includes(fileURLToPath(import.meta.url))) return false;
    if (!hasProcessAncestor(processes, process.ppid, ownerPid)) return false;
    const lockPath = join(common, 'workflow-locks', 'afk-start.lock');
    const probe = process.platform === 'darwin'
      ? spawnSync('lockf', ['-t', '0', lockPath, 'true'], { stdio: 'ignore' })
      : spawnSync('flock', ['-n', lockPath, 'true'], { stdio: 'ignore' });
    return !probe.error && probe.status !== 0;
  } catch { return false; }
}
function validInheritedLockContext(names) {
  const token = process.env.WORKFLOW_LOCK_TOKEN || '';
  const proofPath = process.env.WORKFLOW_LOCK_PROOF || '';
  if (!/^[0-9a-f-]{36}$/i.test(token) || !proofPath) return false;
  try {
    const root = git('rev-parse', '--show-toplevel');
    const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
    const lockDirectory = realpathSync(join(common, 'workflow-locks'));
    const proof = realpathSync(proofPath);
    const stat = statSync(proof);
    if (dirname(proof) !== lockDirectory || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) return false;
    const data = JSON.parse(readFileSync(proof, 'utf8'));
    const inherited = [...new Set((process.env.WORKFLOW_LOCK_NAMES || '').split(',').filter(Boolean))].sort();
    const ownerPid = Number(process.env.WORKFLOW_LOCK_OWNER_PID);
    if (data.token !== token || JSON.stringify(data.names) !== JSON.stringify(inherited) || !names.every(name => inherited.includes(name)) || !Number.isSafeInteger(ownerPid)) return false;
    const table = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
    if (table.error || table.status !== 0) return false;
    const processes = new Map();
    for (const line of table.stdout.split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (match) processes.set(Number(match[1]), { parent: Number(match[2]), command: match[3] });
    }
    const owner = processes.get(ownerPid);
    if (!owner || !owner.command.includes(fileURLToPath(import.meta.url))) return false;
    const ancestors = [];
    let pid = process.ppid;
    for (let depth = 0; pid && depth < 16; depth++) {
      if (pid === ownerPid) break;
      const parent = processes.get(pid);
      if (!parent) return false;
      ancestors.push(parent.command);
      pid = parent.parent;
    }
    if (pid !== ownerPid) return false;
    for (const name of names) {
      const lockPath = join(lockDirectory, `${name}.lock`);
      const probe = process.platform === 'darwin'
        ? spawnSync('lockf', ['-t', '0', lockPath, 'true'], { stdio: 'ignore' })
        : spawnSync('flock', ['-n', lockPath, 'true'], { stdio: 'ignore' });
      if (probe.error || probe.status === 0) return false;
      if (process.platform === 'darwin' && !hasLockfAncestor(ancestors)) return false;
    }
    return true;
  } catch { return false; }
}
function labelsCommand(args) {
  if (args.length !== 1 || args[0] !== 'ensure') throw new Error('Usage: labels ensure');
  const { lanes } = config();
  if (!lanes.repo) throw new Error('Cannot infer a GitHub repository from origin');
  const existing = new Set(jsonCommand('gh', ['label', 'list', '--repo', lanes.repo, '--limit', '1000', '--json', 'name']).map(label => label.name));
  for (const [name, [color, description]] of Object.entries(workflowLabels)) {
    if (existing.has(name)) continue;
    run('gh', ['label', 'create', name, '--repo', lanes.repo, '--color', color, '--description', description]);
    console.log(`Created: ${name}`);
  }
}
function cacheCommand(args) {
  if (args.length !== 1 || !['show', 'refresh'].includes(args[0])) throw new Error('Usage: cache show|refresh');
  const { lanes } = config();
  const metadata = cachedGithubMetadata(lanes.repo, args[0] === 'refresh');
  console.log(JSON.stringify({ repository: lanes.repo, base: lanes.base, owner: lanes.owner, reviewer: lanes.reviewer, project: metadata.project, reviewQueue: metadata.reviewQueue, requiredChecks: lanes.requiredChecks, explore: { ...workflowDefaults.explore, ...lanes.explore }, cache: githubMetadataPath() }));
}
async function execute(command, args) {
  if (!command || command === '--help' || command === 'help') console.log(help);
  else if (command === 'commit') commit(args);
  else if (command === 'push') await push(args);
  else if (command === 'review-context') reviewContext(args);
  else if (command === 'issue' && args[0] === 'claim') { const { lanes } = config(); issueClaim(args.slice(1), lanes); }
  else if (command === 'issue' && args[0] === 'status') { const { lanes } = config(); issueStatus(args.slice(1), lanes); }
  else if (command === 'issue' && args[0] === 'comment') { config(); issueComment(args.slice(1)); }
  else if (command === 'issue' && args[0] === 'close') { config(); issueClose(args.slice(1)); }
  else if (command === 'issue' && args[0] === 'queue') { const { lanes } = config(); issueQueue(args.slice(1)); }
  else if (command === 'labels') labelsCommand(args);
  else if (command === 'cache') cacheCommand(args);
  else if (command === 'afk') process.exitCode = afkCommand(args);
  else if (command === 'manifests') manifestsCommand(args);
  else if (command === 'project') projectVerify(args);
  else if (command === 'release') process.exitCode = releaseCommand(args);
  else if (command === 'safety') { const { lanes } = config(); process.exitCode = safetyCommand(args, lanes); }
  else throw new Error('Invalid command; use --help');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const names = requiredLocks(command, args);
    const oneShotRun = oneShotLedgerRun(command, args);
    const inherited = names.length && validInheritedLockContext(names);
    if (oneShotRun && !inherited && args[0] === 'end' && oneShotWatcherActive(oneShotRun)) {
      const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
      console.log(`One-shot watcher will release run ${oneShotRun} when the agent exits.`);
    } else if (oneShotRun && !inherited && args[0] === 'start') {
      heldWorkflowLocks.add('afk-start');
      await execute(command, args);
    } else if (names.length && inherited) {
      names.forEach(name => heldWorkflowLocks.add(name));
      delete process.env.WORKFLOW_LOCK_NAMES;
      delete process.env.WORKFLOW_LOCK_TOKEN;
      delete process.env.WORKFLOW_LOCK_PROOF;
      delete process.env.WORKFLOW_LOCK_OWNER_PID;
      await execute(command, args);
    } else if (names.length) {
      const common = realpathSync(resolve(git('rev-parse', '--show-toplevel'), git('rev-parse', '--git-common-dir')));
      const result = runWithLocks(join(common, 'workflow-locks'), names, process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { env: process.env });
      if (result.status === 1 || result.status === 75) console.error(`workflow: lock timed out or command failed while acquiring ${names.join(', ')}`);
      process.exitCode = result.status ?? 1;
    } else await execute(command, args);
  } catch (error) {
    console.error(`workflow: ${error.message}`);
    process.exitCode = 1;
  }
}
