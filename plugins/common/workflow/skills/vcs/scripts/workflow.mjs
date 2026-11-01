#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { constants, realpathSync, readFileSync, openSync, fstatSync, closeSync, mkdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const help = `Usage:
  node workflow.mjs commit --message MESSAGE -- PATH...
  node workflow.mjs push [--roles-file ABSOLUTE_PATH]
  node workflow.mjs review-context --pr NUMBER [--previous SHA --previous-base SHA] [--issue NUMBER]
  node workflow.mjs issue claim|status|queue ...
  node workflow.mjs afk start|check|merge|end|runs|reap|env ...

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
  const lanes = raw ? { ...raw.github, ...raw.identities, ...raw.afk, explore: raw.explore || {} } : {};
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

// AFK is deliberately a small set of deterministic GitHub operations. Product
// decisions and implementation stay in the skills; this code only assigns,
// tracks and closes work for the unattended runner.
const afkMarker = (kind, id) => `<!-- afk-${kind} session=${id} -->`;
const afkGh = args => jsonCommand('gh', args);
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
function afkConfig() {
  git('fetch', '--quiet', 'origin');
  const { lanes } = config();
  if (!lanes.repo || !lanes.implementer || !lanes.reviewer) throw new Error('Configure repo, implementer and reviewer in base .github/agent-workflow.json');
  lanes.repo = parseRepo(lanes.repo);
  if (!Array.isArray(lanes.runsCommand) || lanes.runsCommand.length === 0 || !lanes.runsCommand.every(value => typeof value === 'string' && value.length)) throw new Error('Configure afk.runsCommand as a non-empty argv array');
  return lanes;
}
function withRepoLock(name, action) {
  const path = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'workflow-locks', name);
  mkdirSync(dirname(path), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try { mkdirSync(path); break; }
    catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw new Error(`Workflow lock ${name} is busy; retry shortly`);
      spawnSync('sleep', ['0.1']);
    }
  }
  try { return action(); } finally { rmSync(path, { recursive: true, force: true }); }
}
function afkLive(cfg) {
  const output = run(cfg.runsCommand[0], cfg.runsCommand.slice(1));
  const agents = JSON.parse(output || '[]');
  return agents.filter(a => a.kind === 'background' && (a.name || '').startsWith(cfg.runPrefix || 'stagely-afk-') && !['idle', 'done', 'stopped', 'failed'].includes(a.state || a.status)).map(a => a.name);
}
function afkComments(cfg, issue) { return afkGh(['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${issue}/comments`]).flat(); }
function afkIssues(cfg) {
  const [owner, name] = cfg.repo.split('/');
  const query = 'query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){issues(states:OPEN,first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{number title labels(first:30){nodes{name}} blockedBy(first:30){nodes{state}} milestone{dueOn} projectItems(first:10){nodes{project{number} fieldValueByName(name:"Priority"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}}';
  const found = []; let after;
  do {
    const args = ['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`];
    if (after) args.push('-F', `after=${after}`);
    const page = afkGh(args).data.repository.issues;
    found.push(...page.nodes.map(issue => ({ ...issue, labels: issue.labels.nodes.map(label => label.name), priority: issue.projectItems.nodes.find(card => card.project.number === cfg.project?.number)?.fieldValueByName?.name || 'P9' })));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return found;
}
function afkAvailable(cfg, live) {
  const prs = afkGh(['pr', 'list', '--repo', cfg.repo, '--state', 'open', '--limit', '1000', '--json', 'body']);
  const linked = new Set(prs.flatMap(pr => [...(pr.body || '').matchAll(/(?<![\w/])#(\d+)\b/g)].map(match => Number(match[1]))));
  const rank = { P0: 0, P1: 1, P2: 2 };
  return afkIssues(cfg).filter(issue => !issue.labels.includes('type:epic') && issue.labels.includes('lane:afk') && !issue.labels.includes('lane:owner') &&
      !linked.has(issue.number) && !issue.blockedBy.nodes.some(dep => dep.state === 'OPEN'))
    .sort((a, b) => (a.milestone?.dueOn || '9999').localeCompare(b.milestone?.dueOn || '9999') ||
      (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || a.number - b.number)
    .filter(issue => {
      const comments = afkComments(cfg, issue.number);
      const latest = comments.map(c => /<!-- afk-issue-hold session=(\S+) -->/.exec(c.body || '')?.[1]).filter(Boolean).at(-1);
      const claim = comments.map(c => /<!-- afk-claim session=(\S+) -->/.exec(c.body || '')?.[1]).filter(Boolean).at(-1);
      return !live.includes(latest) && !live.includes(claim);
    });
}
function afkExploreDue(cfg, live, currentRun = null) {
  const hours = Number(cfg.explore?.idleHours);
  if (!Number.isFinite(hours) || hours <= 0 || live.some(id => id !== currentRun)) return false;
  const path = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'afk-idle-explore.json');
  try { return Date.now() - Number(JSON.parse(readFileSync(path, 'utf8')).started || 0) >= hours * 3_600_000; }
  catch { return true; }
}
function afkStatus(cfg, issue, value, silent = false) {
  const statusNames = { BACKLOG: 'Backlog', TODO: 'Todo', PROGRESS: 'In progress', REVIEW: 'Review', DONE: 'Done' };
  const target = statusNames[value];
  const project = cfg.project;
  if (!target || !project?.number) throw new Error('Configure github.project and a valid status value');
  const owner = project.owner || cfg.repo.split('/')[0];
  const id = run('gh', ['project', 'view', String(project.number), '--owner', owner, '--format', 'json', '--jq', '.id']);
  const [org, name] = cfg.repo.split('/');
  const query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){state projectItems(first:30){nodes{id project{id}}}}}}';
  const issueData = afkGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${org}`, '-F', `name=${name}`, '-F', `number=${issue}`]).data.repository.issue;
  const card = issueData.projectItems.nodes.find(item => item.project.id === id);
  if (!card) throw new Error(`Issue #${issue} is not on project ${project.number}`);
  const final = issueData.state === 'CLOSED' ? 'Done' : target;
  const field = afkGh(['project', 'field-list', String(project.number), '--owner', owner, '--format', 'json']).fields.find(item => item.name === 'Status');
  const option = field?.options.find(item => item.name.toLowerCase() === final.toLowerCase());
  if (!option) throw new Error(`Project is missing Status option ${final}`);
  run('gh', ['project', 'item-edit', '--project-id', id, '--id', card.id, '--field-id', field.id, '--single-select-option-id', option.id]);
  if (!silent) console.log(`#${issue} → ${final}`);
}
function afkQueue(args) {
  const o = afkFlags(args, ['--kind', '--number', '--text']);
  const heading = { waiting: 'Waiting for the owner', decision: 'Decisions you may challenge' }[o['--kind']];
  if (!heading || !/^[1-9]\d*$/.test(o['--number'] || '') || !o['--text']?.trim() || o['--text'].length > 500 || /[\r\n]/.test(o['--text'])) throw new Error('Queue requires waiting|decision, an issue number and one-line text (max 500 chars)');
  const cfg = afkConfig(); afkActor(cfg);
  if (!Number.isInteger(cfg.reviewQueue)) throw new Error('Configure github.reviewQueue');
  const lock = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'workflow-locks', 'afk-queue');
  mkdirSync(dirname(lock), { recursive: true });
  try { mkdirSync(lock); } catch { throw new Error('Review queue is being updated; retry shortly'); }
  try {
    const body = afkGh(['issue', 'view', String(cfg.reviewQueue), '--repo', cfg.repo, '--json', 'body']).body || '';
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
  } finally { rmSync(lock, { recursive: true, force: true }); }
}
function issueClaim(args, lanes) {
  const o = afkFlags(args, ['--number', '--run', '--note']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1 || !/^[\w.-]+$/.test(o['--run'] || '')) throw new Error('Usage: issue claim --number N --run ID [--note TEXT]');
  const cfg = afkConfig(); afkActor(cfg);
  const marker = /<!-- afk-claim session=(\S+) -->/;
  const lock = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'workflow-locks', `claim-${n}`);
  mkdirSync(dirname(lock), { recursive: true });
  try { mkdirSync(lock); } catch { throw new Error(`#${n} claim is being updated; retry shortly`); }
  try {
    const current = afkComments(cfg, n).map(c => marker.exec(c.body || '')?.[1]).filter(Boolean).at(-1);
    if (current && current !== o['--run']) throw new Error(`#${n} is claimed by ${current}`);
    const created = afkGh(['api', `repos/${cfg.repo}/issues/${n}/comments`, '-f', `body=${afkMarker('claim', o['--run'])}\nClaimed by ${o['--run']}.${o['--note'] ? ` ${o['--note']}` : ''}`]);
    const newest = afkComments(cfg, n).map(c => marker.exec(c.body || '')?.[1]).filter(Boolean).at(-1);
    if (newest !== o['--run']) {
      run('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${created.id}`, '-f', `body=<!-- afk-claim-raced session=${o['--run']} -->`]);
      throw new Error(`Claim race on #${n}; current claim is ${newest || 'unknown'}`);
    }
    console.log(`Claimed #${n} for ${o['--run']}`);
  } finally { rmSync(lock, { recursive: true, force: true }); }
}
function issueStatus(args, lanes) {
  const o = afkFlags(args, ['--number', '--value']);
  const n = Number(o['--number']);
  if (!Number.isInteger(n) || n < 1) throw new Error('Usage: issue status --number N --value STATUS');
  const cfg = afkConfig(); afkActor(cfg); afkStatus(cfg, n, (o['--value'] || '').toUpperCase());
}
function issueQueue(args, lanes) { afkQueue(args); }
function afkPrs(cfg) {
  return afkGh(['pr', 'list', '--repo', cfg.repo, '--state', 'open', '--limit', '1000', '--json', 'number,headRefOid,labels,reviews,isDraft,statusCheckRollup,mergeable']);
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
function afkCommand(args) {
  try {
    const [action, ...rest] = args;
    const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
    if (action === 'env') {
      const env = JSON.parse(readFileSync(join(homedir(), '.claude/settings.json'), 'utf8')).env || {};
      for (const [key, value] of Object.entries(env)) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) console.log(`export ${key}='${String(value).replaceAll("'", "'\\''")}'`);
      return 0;
    }
    const cfg = afkConfig();
    if (action === 'runs') {
      const agents = JSON.parse(run(cfg.runsCommand[0], cfg.runsCommand.slice(1)) || '[]');
      console.log(agents.filter(a => a.kind === 'background' && (a.name || '').startsWith(cfg.runPrefix || 'stagely-afk-') && !['idle', 'done', 'stopped', 'failed'].includes(a.state || a.status)).map(a => a.name).join('\n')); return 0;
    }
    if (action === 'reap') {
      const file = join(common, 'afk-prompt-waits.json'); let previous = {};
      try { previous = JSON.parse(readFileSync(file, 'utf8')); } catch {}
      const agents = JSON.parse(run(cfg.runsCommand[0], cfg.runsCommand.slice(1)) || '[]').filter(a => a.kind === 'background' && (a.name || '').startsWith(cfg.runPrefix || 'stagely-afk-') && a.pid);
      const now = Date.now(), waiting = {}, stops = [];
      for (const agent of agents) {
        let ended = false;
        if (agent.status === 'idle') try { ended = !JSON.parse(readFileSync(join(homedir(), '.claude/jobs', agent.id, 'state.json'), 'utf8')).inFlight?.tasks?.length; } catch {}
        const reason = agent.waitingFor || (ended ? 'finished turn' : null);
        if (reason) waiting[agent.id] = previous[agent.id] || now;
        if (agent.state === 'done' || (agent.state === 'blocked' && !agent.waitingFor) || (reason && now - waiting[agent.id] >= 600_000)) stops.push(agent);
      }
      mkdirSync(dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(waiting)); renameSync(tmp, file);
      for (const agent of stops) { spawnSync('claude', ['stop', agent.id], { stdio: 'ignore' }); console.error(`stopped ${agent.name}: wait ended`); }
      return 0;
    }
    afkActor(cfg);
    if (action === 'merge') {
      const wanted = rest.map(v => { if (!/^[1-9]\d*$/.test(v)) throw new Error(`Invalid PR number: ${v}`); return Number(v); });
      console.log(afkMerge(cfg, afkPrs(cfg), wanted.length ? new Set(wanted) : null).join('\n') || 'Merged nothing.'); return 0;
    }
    if (action === 'start') {
      const id = afkFlags(rest, ['--me'])['--me'];
      if (!/^[\w.-]+$/.test(id || '')) throw new Error('Usage: afk start --me RUN_ID');
      return withRepoLock('afk-start', () => {
        const path = join(common, 'afk-holds.json'); let holds = {};
        try { holds = JSON.parse(readFileSync(path, 'utf8')); } catch {}
        if (holds[id]) { console.log(`Hold: issue #${holds[id].number}`); return 0; }
        const live = afkLive(cfg);
        if (Number(cfg.maxRuns) > 0 && live.filter(name => name !== id).length >= Number(cfg.maxRuns)) { console.log('Done: afk.maxRuns reached'); return 3; }
        const free = afkAvailable(cfg, live)[0];
        if (!free) {
          if (afkExploreDue(cfg, live, id)) {
            const explore = join(common, 'afk-idle-explore.json'); const tmp = `${explore}.${process.pid}.tmp`;
            writeFileSync(tmp, JSON.stringify({ session: id, started: Date.now() })); renameSync(tmp, explore);
            console.log('Explore: no issue is free; run the exploratory usability pass.'); return 4;
          }
          console.log('Done: no eligible unclaimed issue'); return 3;
        }
        return withRepoLock(`afk-issue-${free.number}`, () => {
          const created = afkGh(['api', `repos/${cfg.repo}/issues/${free.number}/comments`, '-f', `body=${afkMarker('issue-hold', id)}\nRun ${id} holds this issue.`]);
          try {
            if (!afkComments(cfg, free.number).some(c => c.id === created.id)) throw new Error(`Could not verify hold on #${free.number}`);
            afkStatus(cfg, free.number, 'PROGRESS', true);
          } catch (error) {
            spawnSync('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${created.id}`, '-f', `body=${afkMarker('issue-released', id)}\nStart failed; hold released.`], { stdio: 'ignore' });
            throw error;
          }
          holds[id] = { number: free.number, comment: created.id, at: Date.now() };
          mkdirSync(dirname(path), { recursive: true }); const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(holds)); renameSync(tmp, path);
          console.log(`Hold: issue #${free.number}\nWork: #${free.number} ${free.title}`); return 0;
        });
      });
    }
    if (action === 'check') {
      if (rest.some(value => value !== '--quiet')) throw new Error('Usage: afk check [--quiet]');
      const live = afkLive(cfg); let stateFile; let signal;
      if (rest.includes('--quiet')) {
        stateFile = join(common, 'afk-check.json');
        signal = [run('gh', ['api', `repos/${cfg.repo}/events?per_page=1`, '--jq', '.[0].id // empty']),
          run('gh', ['api', `repos/${cfg.repo}/actions/runs?per_page=10`, '--jq', '[.workflow_runs[] | "\(.id):\(.status):\(.conclusion)"] | join(",")']), live.join(',')].join('|');
        try { const previous = JSON.parse(readFileSync(stateFile, 'utf8')); if (previous.signal === signal && Date.now() - previous.at < 1_800_000) { console.log('Quiet: nothing changed'); return 3; } } catch {}
      }
      const prs = afkPrs(cfg); const merge = afkMerge(cfg, prs);
      const free = afkAvailable(cfg, live).length; let count = Math.max(0, Math.min(Number(cfg.maxRuns || free), free) - live.length);
      if (!count && !live.length && afkExploreDue(cfg, live)) count = 1;
      if (stateFile) { mkdirSync(dirname(stateFile), { recursive: true }); writeFileSync(stateFile, JSON.stringify({ signal, at: Date.now() })); }
      console.log(count ? `Start: ${count}` : `Done: no new run has work (${live.length} live).`);
      if (merge.length) console.log(merge.join('\n')); return count ? 0 : 3;
    }
    if (action === 'end') {
      const id = afkFlags(rest, ['--me'])['--me'];
      if (!/^[\w.-]+$/.test(id || '')) throw new Error('Usage: afk end --me RUN_ID');
      return withRepoLock('afk-start', () => {
        const path = join(common, 'afk-holds.json'); let holds = {};
        try { holds = JSON.parse(readFileSync(path, 'utf8')); } catch {}
        const issue = holds[id]?.number;
        if (issue) {
          for (const c of afkComments(cfg, issue)) if ((c.body || '').includes(afkMarker('issue-hold', id))) run('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${c.id}`, '-f', `body=${afkMarker('issue-released', id)}`]);
          const linked = afkGh(['pr', 'list', '--repo', cfg.repo, '--state', 'open', '--limit', '1000', '--json', 'body']).some(pr => (pr.body || '').includes(`#${issue}`));
          afkStatus(cfg, issue, linked ? 'REVIEW' : 'TODO', true); delete holds[id];
          const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(holds)); renameSync(tmp, path);
        }
        console.log(issue ? `Released issue #${issue}` : 'No issue hold'); return 0;
      });
    }
    throw new Error('Usage: afk <start|check|merge|end|runs|reap|env>');
  } catch (error) { console.error(`Blocked: ${error.message}; resolve the cause and retry.`); return 2; }
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') console.log(help);
  else if (command === 'commit') commit(args);
  else if (command === 'push') await push(args);
  else if (command === 'review-context') reviewContext(args);
  else if (command === 'issue' && args[0] === 'claim') { const { lanes } = config(); issueClaim(args.slice(1), lanes); }
  else if (command === 'issue' && args[0] === 'status') { const { lanes } = config(); issueStatus(args.slice(1), lanes); }
  else if (command === 'issue' && args[0] === 'queue') { const { lanes } = config(); issueQueue(args.slice(1), lanes); }
  else if (command === 'afk') process.exitCode = afkCommand(args);
  else throw new Error('Invalid command; use --help');
} catch (error) {
  console.error(`workflow: ${error.message}`);
  process.exitCode = 1;
}
