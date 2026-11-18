import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { gate, isGraphql, isGraphqlRead, parseSecondaryLimit, retrySecondary } from './quota.mjs';

export const heldWorkflowLocks = new Set();
export const workflowDefaults = {
  github: { requiredChecks: ['verify'], metadataCacheHours: 24 },
  // The implementer's GitHub environment for issue writes, and the repository skill and CLI follow-ups are filed in.
  cli: { environmentFile: '~/.config/gh-agents/workflow-env.json', toolingRepository: 'https://github.com/FilipKrawiec/skills.git' },
  explore: { personas: '.agents/personas.md', maxIssues: 3, capturesBranch: 'explore-captures' },
};
// Identical GraphQL reads within one invocation run once; any other GitHub call may change state and clears them.
const readMemo = new Map();
export const quotaPolicy = { memo: true, waitWhenExhausted: false };
export function run(program, args, options = {}) {
  const memoKey = program === 'gh' && quotaPolicy.memo && isGraphql(args) && isGraphqlRead(args) ? JSON.stringify([args, options.cwd, options.input]) : null;
  // Any call that is not a memoized read may change state, whatever the program or API.
  if (!memoKey) readMemo.clear();
  if (program !== 'gh') return execute(program, args, options);
  // GitHub keeps one secondary limit per token across REST and GraphQL, so REST calls honour the shared backoff too.
  if (options.quota === false || process.env.WORKFLOW_QUOTA === 'off' || !isGraphql(args)) return retrySecondary(() => execute(program, args, options));
  if (memoKey && readMemo.has(memoKey)) return readMemo.get(memoKey);
  const output = retrySecondary(() => { gate(args, { waitWhenExhausted: quotaPolicy.waitWhenExhausted }); return execute(program, args, options); });
  if (memoKey) readMemo.set(memoKey, output); else readMemo.clear();
  return output;
}
function execute(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    const scopeFailure = program === 'gh' ? githubScopeFailure(result.stderr || '') : null;
    const network = program === 'gh' && /error connecting|could not resolve host|failed to connect|connection (?:timed out|refused)|network is unreachable|no such host|dial tcp/i.test(result.stderr || '');
    const subject = program === 'gh' ? githubSubject(args) : '';
    const secondaryLimit = program === 'gh' ? parseSecondaryLimit(`${result.stderr || ''}\n${result.stdout || ''}`) : null;
    throw Object.assign(new Error(scopeFailure || (network ? 'Cannot reach GitHub; check network or sandbox access and retry.' : program === 'gh' ? `GitHub command failed (${subject})${githubFailureLine(result, options)}; check network access and the configured account before reauthenticating.` : `${program} ${args[0]} failed${failureCause(result)}`)), { secondaryLimit });
  }
  return result.stdout.trim();
}
// The command's subject (`gh api repos/o/r/issues/362/sub_issues`), without payload flags, so a failure names what was asked.
const payloadFlags = new Set(['-f', '-F', '--field', '--raw-field', '--body', '--input', '--jq', '-q', '--json', '--template', '--title', '--body-file']);
function githubSubject(args) {
  const words = [];
  for (const arg of args) { if (payloadFlags.has(arg) || /^(?:query|-f)=/.test(arg)) break; words.push(arg); }
  return `gh ${words.join(' ')}`.slice(0, 160);
}
// GitHub's own error line or HTTP status, with the active token removed.
function githubFailureLine(result, options) {
  if (result.error) return `: ${result.error.code || result.error.message}`;
  const lines = String(result.stderr || '').split(/\r?\n/).map(text => text.trim()).filter(Boolean);
  let line = lines.find(text => /\bHTTP \d{3}\b/.test(text)) || lines[0] || '';
  let detail = '';
  try { detail = JSON.parse(result.stdout || '').message || ''; } catch { /* no JSON body */ }
  if (detail && !line.includes(detail)) line = `${line} ${detail}`.trim();
  for (const token of [options.env?.GH_TOKEN, process.env.GH_TOKEN].filter(Boolean)) line = line.split(token).join('[redacted]');
  line = gitFailureLine(line, { max: 240 });
  return line ? `: ${line}` : result.status ? ` (exit ${result.status})` : '';
}
// Name the cause so an intermittent failure can be diagnosed instead of re-run blindly.
function failureCause(result) {
  if (result.error) return ` (${result.error.code || result.error.message})`;
  const line = gitFailureLine(result.stderr || '', { last: true, max: 200 });
  return ` (${result.signal ? `signal ${result.signal}` : `exit ${result.status}`})${line ? `: ${line}` : ''}`;
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
export function git(...args) { return run('git', args, { env: cleanEnvironment() }); }
export function jsonCommand(program, args, options) { return JSON.parse(run(program, args, options)); }
export function cleanEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(GH_TOKEN|GITHUB_TOKEN|GH_HOST|GH_CONFIG_DIR|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GIT_ASKPASS|SSH_ASKPASS|SSH_AUTH_SOCK|SSH_AGENT_PID|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+|GIT_SSH|GIT_SSH_COMMAND|GIT_PROXY_COMMAND|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_NAMESPACE|GIT_CONFIG_PARAMETERS|GIT_CONFIG|GIT_EXEC_PATH|GIT_TRACE.*|GIT_CURL_VERBOSE|GIT_SSL_NO_VERIFY|NODE_OPTIONS|NODE_PATH|WORKFLOW_PUSH_TOKEN|WORKFLOW_CREDENTIAL_SOCKET|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_INDEX_FILE|GIT_TEMPLATE_DIR)$/i.test(key)) delete env[key];
  }
  // Replacement refs are local overrides and must not change trusted commits or trees.
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return env;
}
// The shape `config()` accepts for .agents/config.json: version 1, no explore block, object sections.
export const validConfigShape = raw => Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw) && raw.version === 1 && !Object.hasOwn(raw, 'explore') &&
  [raw.identities ?? {}, raw.github ?? {}, raw.steps ?? {}].every(v => v && typeof v === 'object' && !Array.isArray(v));
export function assertDistinctPushRoles({ owner, implementer, reviewer }) {
  const values = [owner, implementer, reviewer];
  if (values.some(value => typeof value !== 'string' || !/^[A-Za-z0-9-]+$/.test(value)) || new Set(values.map(value => value.toLowerCase())).size !== values.length) {
    throw new Error('Configure distinct implementer, reviewer and owner accounts in trusted roles');
  }
}
export function config(requireLanes = true, allowBootstrap = false, allowBootstrapBranchOwner = false) {
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
  const present = git('ls-tree', '--name-only', baseRef, '--', `:(top)${path}`);
  let source = 'base';
  let configPath = present ? `${baseRef}:${path}` : null;
  if (!present && allowBootstrap && git('ls-tree', '--name-only', 'HEAD', '--', `:(top)${path}`)) {
    configPath = `HEAD:${path}`;
    source = 'branch bootstrap';
  }
  const raw = configPath ? JSON.parse(git('show', configPath)) : null;
  if (configPath && !validConfigShape(raw)) throw new Error('Invalid workflow configuration; use steps.process/assemble/test instead of an explore block');
  if (raw && source === 'branch bootstrap' && (['repo', 'base'].some(key => Object.hasOwn(raw.github || {}, key))
    || Object.hasOwn(raw, 'labels'))) {
    throw new Error('Workflow GitHub metadata comes from Git and the local cache; use CLI defaults for labels and repository scripts under steps');
  }
  if (raw && source === 'branch bootstrap' && !allowBootstrapBranchOwner && Object.hasOwn(raw.identities || {}, 'owner')) {
    throw new Error('A branch config may set identities.owner only for push --owner-bootstrap; merge it to base first');
  }
  // Other top-level keys, such as the removed watcher's block, are ignored, so older configs still load.
  const lanes = raw ? { ...raw.github, ...raw.identities, steps: validateWorkflowSteps(raw.steps || {}), delivery: raw.delivery } : { steps: {} };
  const remote = git('remote', 'get-url', 'origin');
  lanes.repo = githubRepoFromRemote(remote);
  lanes.base = baseRef.slice('refs/remotes/origin/'.length);
  lanes.requiredChecks ??= workflowDefaults.github.requiredChecks;
  const roles = codeownersRolesFrom(codeownersContents(baseRef), lanes.repo, raw?.identities?.owner);
  const { owner, defaultReviewer } = roles;
  lanes.owner = owner;
  if (roles.ownerInferred && raw) requireUserRepositoryOwner(lanes.repo);
  lanes.codeowners = roles.contents;
  if (lanes.reviewer != null && (typeof lanes.reviewer !== 'string' || !/^[A-Za-z0-9-]+$/.test(lanes.reviewer))) throw new Error('identities.reviewer must be a GitHub login');
  if (!defaultReviewer) throw new Error('The trusted .github/CODEOWNERS must name exactly one user for the default Reviewer');
  if (lanes.reviewer && lanes.reviewer.toLowerCase() !== defaultReviewer.toLowerCase()) throw new Error('identities.reviewer must match the default .github/CODEOWNERS reviewer');
  // The commit the configuration came from, so an instruction can name it.
  lanes.configCommit = configPath ? git('rev-parse', configPath.startsWith('HEAD:') ? 'HEAD' : baseRef) : undefined;
  return { root, lanes, baseRef, configSource: source, configAvailable: Boolean(configPath) };
}
// Drive reads delivery roles from the remote default branch, so a merged config change applies without a manual fetch.
export function fetchedConfig(...args) {
  git('fetch', '--quiet', 'origin');
  return config(...args);
}
export function githubRepoFromRemote(remote) {
  const match = /^(?:https:\/\/(?:www\.)?github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote || '');
  if (!match) throw new Error('origin must identify a GitHub owner/repository');
  return match[1];
}
function codeownersContents(baseRef) {
  try { return git('show', `${baseRef}:.github/CODEOWNERS`); }
  catch { throw new Error('The trusted base must contain .github/CODEOWNERS to identify review roles'); }
}
// An organization has no user login; only a personal repository owner can stand in for the Owner.
function requireUserRepositoryOwner(repo) {
  let type;
  try { type = gh(['api', `repos/${repo}`]).owner?.type; } catch { throw new Error('Cannot verify the repository owner is a user account; set identities.owner in .agents/config.json'); }
  if (type !== 'User') throw new Error('The repository owner is not a user account; set identities.owner in .agents/config.json to the Owner login');
}
// The Owner is identities.owner, else the personal repository owner; CODEOWNERS only names the default Reviewer.
export function codeownersRolesFrom(contents, repo, configOwner) {
  const rules = contents.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim().split(/\s+/).filter(Boolean)).filter(parts => parts.length);
  const wildcard = [...rules].reverse().find(parts => parts[0] === '*');
  const defaultOwners = wildcard?.slice(1).filter(value => /^@[A-Za-z0-9-]+$/.test(value)).map(value => value.slice(1)) || [];
  if (defaultOwners.length !== 1) throw new Error('The trusted .github/CODEOWNERS must name exactly one user for the default Reviewer');
  const defaultReviewer = defaultOwners[0];
  if (configOwner != null) {
    if (typeof configOwner !== 'string' || !/^[A-Za-z0-9-]+$/.test(configOwner)) throw new Error('identities.owner must be a GitHub login');
    return { owner: configOwner, defaultReviewer, contents };
  }
  return { owner: repo.split('/')[0], defaultReviewer, ownerInferred: true, contents };
}
export function validateWorkflowSteps(steps) {
  if (!steps || typeof steps !== 'object' || Array.isArray(steps)) throw new Error('steps must be an object');
  for (const [step, command] of Object.entries(steps)) {
    if (!['process', 'assemble', 'test'].includes(step)) throw new Error(`Unknown workflow step: ${step}`);
    if (step === 'process' && command !== null) throw new Error('steps.process is handled by workflow skills and must be null');
    if (command !== null && (!Array.isArray(command) || !command.length || !command.every(value => typeof value === 'string' && value.length))) {
      throw new Error(`steps.${step} must be null or a non-empty command argument array`);
    }
  }
  return steps;
}
export function parseRepo(repo) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('lanes.repo must be owner/repository on github.com');
  return repo;
}
export function requireLinkedWorktree() {
  const root = git('rev-parse', '--show-toplevel');
  const gitDir = realpathSync(resolve(root, git('rev-parse', '--git-dir')));
  const commonDir = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
  if (gitDir === commonDir) throw new Error('Use an isolated linked worktree; refusing to change the main checkout');
  return root;
}
// Git's first (or last) diagnostic line, with tokens and URL credentials removed.
export function gitFailureLine(output, { last = false, max = 300 } = {}) {
  const lines = String(output).split(/\r?\n/).map(text => text.trim()).filter(Boolean);
  const line = (last ? lines.at(-1) : lines[0]) || '';
  return line.replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[redacted]').replace(/(\/\/)[^/@\s]+@/g, '$1[redacted]@').slice(0, max);
}
export function githubPushRemoteMatches(remote, repo) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
  return Boolean(match && match[1].toLowerCase() === String(repo).toLowerCase());
}
export const gh = args => jsonCommand('gh', args);
// Parses `--key value` pairs, each allowed key at most once.
export function flags(args, allowed) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!allowed.includes(key) || !args[i + 1] || Object.hasOwn(result, key)) throw new Error(`Expected ${allowed.join(' ')}`);
    result[key] = args[i + 1];
  }
  return result;
}
export function requireImplementer(cfg) {
  const actor = gh(['api', 'user']).login;
  if (!cfg.implementer || actor?.toLowerCase() !== cfg.implementer.toLowerCase()) throw new Error(`Authenticated as ${actor || 'unknown'}; workflow writes require ${cfg.implementer || 'a configured implementer'}`);
}
// The trusted roles with the CLI defaults, after a fetch, for commands that write to GitHub.
export function writerConfig() {
  git('fetch', '--quiet', 'origin');
  const { lanes } = config();
  if (!lanes.repo || !lanes.implementer || !lanes.reviewer) throw new Error('Configure identities.implementer and identities.reviewer; repo comes from Git and Owner from CODEOWNERS');
  assertDistinctPushRoles({ owner: lanes.owner, implementer: lanes.implementer, reviewer: lanes.reviewer });
  for (const [key, value] of Object.entries(workflowDefaults.cli)) lanes[key] ??= value;
  return lanes;
}
// Replaces inherited GitHub and Git credentials with the implementer's environment file, then applies the cached board.
export function loadEnvironment(cfg) {
  for (const key of Object.keys(process.env)) {
    if (/^(GH_TOKEN|GITHUB_TOKEN|GH_HOST|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GIT_ASKPASS|SSH_ASKPASS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+|GIT_SSH|GIT_SSH_COMMAND|GIT_PROXY_COMMAND|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_NAMESPACE|GIT_CONFIG_PARAMETERS|GIT_CONFIG|GIT_EXEC_PATH|GIT_TRACE.*|GIT_CURL_VERBOSE|GIT_SSL_NO_VERIFY|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_INDEX_FILE|GIT_TEMPLATE_DIR)$/i.test(key)) delete process.env[key];
  }
  const file = expandedPath(cfg.environmentFile);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  const env = value?.env;
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error(`${file} must contain an env object`);
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) {
    if (typeof env[key] === 'string' && env[key]) process.env[key] = env[key];
  }
  if (cfg.repo) cfg.project ??= cachedGithubMetadata(cfg.repo).project;
}
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
export function githubMetadataPath() { return workflowMetadataCachePath(git('rev-parse', '--path-format=absolute', '--git-common-dir')); }
// Discovered board states: a project, `false` for no board, or `{ ambiguous }` for tied boards.
// `null` (written before this encoding) and an absent field both mean discovery is unknown.
export function discoveredProject(projects) {
  if (!projects.length) return false;
  const [top, next] = projects;
  if (next && next.count === top.count) return { ambiguous: projects.filter(item => item.count === top.count).map(item => item.number) };
  return { number: top.number, title: top.title, ...(top.owner ? { owner: top.owner } : {}) };
}
export function discoverGithubMetadata(repo) {
  const [owner, name] = repo.split('/');
  const counts = new Map(); let after; let project;
  const query = 'query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){issues(states:OPEN,first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{projectItems(first:10){nodes{project{number title owner{... on Organization{login} ... on User{login}}}}}}}}}';
  try {
    do {
      const args = ['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`];
      if (after) args.push('-F', `after=${after}`);
      const issues = gh(args).data.repository.issues;
      for (const item of issues.nodes.flatMap(issue => issue.projectItems.nodes)) {
        const current = counts.get(item.project.number) || { number: item.project.number, title: item.project.title, owner: item.project.owner?.login, count: 0 };
        current.count++;
        counts.set(current.number, current);
      }
      after = issues.pageInfo.hasNextPage ? issues.pageInfo.endCursor : null;
    } while (after);
    const projects = [...counts.values()].sort((a, b) => b.count - a.count);
    project = discoveredProject(projects);
  } catch { /* Project scope or API access can be unavailable; the workflow runs without the board. */ }
  return project !== undefined ? { project } : {};
}
export function cachedGithubMetadata(repo, refresh = false) {
  return readThroughLocalCache(githubMetadataPath(), repo, () => discoverGithubMetadata(repo), {
    ttlMs: workflowDefaults.github.metadataCacheHours * 3_600_000, refresh, expectedFields: ['project'],
  });
}
export function withRepoLock(name, action) {
  if (!heldWorkflowLocks.has(name)) throw new Error(`Workflow lock ${name} must be acquired by the CLI entry point`);
  return action();
}
export const workflowLabels = {
  'lane:owner': ['d93f0b', 'Requires owner participation to decide or implement'],
  'state:started': ['fef2c0', 'An attended session is working on this'],
  'state:reviewing': ['0e8a16', 'The Reviewer is reviewing this PR'],
  'review:owner': ['e99695', 'PR is waiting for owner approval'],
  'risk:R0': ['c2e0c6', 'Low-risk PR: docs, tests or a local change'],
  'risk:R1': ['fef2c0', 'PR changes behaviour inside one boundary'],
  'risk:R2': ['d93f0b', 'Critical failure with difficult or unresolved recovery and cost'],
  'nits:swept': ['ededed', 'Merged PR whose review Nits were swept'],
  'type:epic': ['3e4b9e', 'Parent of bounded work items'],
  'type:story': ['a2eeef', 'New or changed user-visible behavior'],
  'type:bug': ['d73a4a', 'A fix for something that does not work as specified'],
};
// Creates each workflow label the repository lacks and returns their names; `list` and `create` default to gh.
export function ensureWorkflowLabels(repo, list = () => jsonCommand('gh', ['label', 'list', '--repo', repo, '--limit', '1000', '--json', 'name']), create = (name, color, description) => run('gh', ['label', 'create', name, '--repo', repo, '--color', color, '--description', description])) {
  const existing = new Set(list().map(label => label.name));
  const created = [];
  for (const [name, [color, description]] of Object.entries(workflowLabels)) {
    if (existing.has(name)) continue;
    create(name, color, description); created.push(name);
  }
  return created;
}
export function expandedPath(path) { return path.replace(/^~(?=\/|$)/, homedir()); }

// Agents write bodies and briefs here: inside the worktree, so isolation and the body-file check accept them, and never committed.
export function workflowScratch(root = git('rev-parse', '--show-toplevel')) {
  const exclude = join(realpathSync(git('rev-parse', '--path-format=absolute', '--git-common-dir')), 'info', 'exclude');
  const ignored = existsSync(exclude) && readFileSync(exclude, 'utf8').split('\n').includes('/.wf/');
  if (!ignored) { mkdirSync(dirname(exclude), { recursive: true }); appendFileSync(exclude, '/.wf/\n'); }
  const path = join(root, '.wf');
  mkdirSync(path, { recursive: true });
  return path;
}
