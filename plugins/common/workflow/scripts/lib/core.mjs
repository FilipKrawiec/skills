import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const heldWorkflowLocks = new Set();
export const workflowDefaults = {
  github: { requiredChecks: ['verify'], metadataCacheHours: 24 },
  afk: {
    runPrefix: 'afk-', maxRuns: 4, environmentFile: '~/.config/gh-agents/workflow-env.json',
    watchIntervalSeconds: 60, startCommand: ['claude', '--print', '--output-format', 'json', '--plugin-dir', '{pluginDir}', '--name', '{runId}', '--worktree', '{runId}', '--permission-mode', '{permissionMode}', '{prompt}'],
    permissionMode: 'auto', pluginUpdateCommands: [], maxRunMinutes: 60,
    toolingRepository: 'https://github.com/FilipKrawiec/skills.git', toolingRef: 'main', toolingDirectory: '~/.local/share/workflow-cli/skills',
  },
  explore: { personas: '.agents/personas.md', maxIssues: 3, idleHours: 24, capturesBranch: 'explore-captures' },
};
export function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    const scopeFailure = program === 'gh' ? githubScopeFailure(result.stderr || '') : null;
    const network = program === 'gh' && /error connecting|could not resolve host|failed to connect|connection (?:timed out|refused)|network is unreachable|no such host|dial tcp/i.test(result.stderr || '');
    throw new Error(scopeFailure || (network ? 'Cannot reach GitHub; check network or sandbox access and retry.' : program === 'gh' ? 'GitHub command failed; check network access and the configured account before reauthenticating.' : `${program} ${args[0]} failed${failureCause(result)}`));
  }
  return result.stdout.trim();
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
  const present = git('ls-tree', '--name-only', baseRef, '--', path);
  let source = 'base';
  let configPath = present ? `${baseRef}:${path}` : null;
  if (!present && allowBootstrap && git('ls-tree', '--name-only', 'HEAD', '--', path)) {
    configPath = `HEAD:${path}`;
    source = 'branch bootstrap';
  }
  const raw = configPath ? JSON.parse(git('show', configPath)) : null;
  if (configPath && (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || Object.hasOwn(raw, 'explore') || ![raw.identities ?? {}, raw.github ?? {}, raw.afk ?? {}, raw.steps ?? {}].every(v => v && typeof v === 'object' && !Array.isArray(v)))) throw new Error('Invalid workflow configuration; use steps.process/assemble/test instead of an explore block');
  if (raw && source === 'branch bootstrap' && (['owner'].some(key => Object.hasOwn(raw.identities || {}, key))
    || ['repo', 'base'].some(key => Object.hasOwn(raw.github || {}, key))
    || Object.hasOwn(raw, 'labels'))) {
    throw new Error('Workflow roles and GitHub metadata come from CODEOWNERS/Git and the local cache; use CLI defaults for labels and repository scripts under steps');
  }
  const lanes = raw ? { ...raw.github, ...raw.identities, ...raw.afk, steps: validateWorkflowSteps(raw.steps || {}) } : { steps: {} };
  const remote = git('remote', 'get-url', 'origin');
  lanes.repo = githubRepoFromRemote(remote);
  lanes.base = baseRef.slice('refs/remotes/origin/'.length);
  lanes.requiredChecks ??= workflowDefaults.github.requiredChecks;
  const roles = codeownersRoles(baseRef, lanes.repo, allowBootstrapBranchOwner && source === 'branch bootstrap');
  const { owner, defaultReviewer } = roles;
  lanes.owner = owner;
  if (lanes.reviewer != null && (typeof lanes.reviewer !== 'string' || !/^[A-Za-z0-9-]+$/.test(lanes.reviewer))) throw new Error('identities.reviewer must be a GitHub login');
  if (!defaultReviewer) throw new Error('The trusted .github/CODEOWNERS must name exactly one user for the default Reviewer');
  if (lanes.reviewer && lanes.reviewer.toLowerCase() !== defaultReviewer.toLowerCase()) throw new Error('identities.reviewer must match the default .github/CODEOWNERS reviewer');
  return { root, lanes, baseRef, configSource: source, configAvailable: Boolean(configPath) };
}
export function githubRepoFromRemote(remote) {
  const match = /^(?:https:\/\/(?:www\.)?github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote || '');
  if (!match) throw new Error('origin must identify a GitHub owner/repository');
  return match[1];
}
function codeownersRoles(baseRef, repo, allowBranchOwner = false) {
  let contents;
  try { contents = git('show', `${baseRef}:.github/CODEOWNERS`); }
  catch { throw new Error('The trusted base must contain .github/CODEOWNERS to identify review roles'); }
  const roles = codeownersRolesFrom(contents, repo, !allowBranchOwner);
  if (roles.owner || !allowBranchOwner) return roles;
  let branchContents;
  try { branchContents = git('show', 'HEAD:.github/CODEOWNERS'); }
  catch { throw new Error('The committed bootstrap branch must contain .github/CODEOWNERS to identify the Owner'); }
  const branchOwner = codeownersRolesFrom(branchContents, repo, false).owner;
  if (!branchOwner) throw new Error('The committed bootstrap branch CODEOWNERS must identify one Owner account');
  return { ...roles, owner: branchOwner };
}
export function codeownersRolesFrom(contents, repo, requireOwner = true) {
  const rules = contents.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim().split(/\s+/).filter(Boolean)).filter(parts => parts.length);
  const wildcard = [...rules].reverse().find(parts => parts[0] === '*');
  const defaultOwners = wildcard?.slice(1).filter(value => /^@[A-Za-z0-9-]+$/.test(value)).map(value => value.slice(1)) || [];
  if (defaultOwners.length !== 1) throw new Error('The trusted .github/CODEOWNERS must name exactly one user for the default Reviewer');
  const defaultReviewer = defaultOwners[0];
  const repoOwner = repo.split('/')[0];
  const owners = [...new Set(rules.flatMap((parts, index) => index === rules.indexOf(wildcard) ? [] : parts.slice(1)).filter(value => /^@[A-Za-z0-9-]+$/.test(value)).map(value => value.slice(1)))];
  const owner = owners.find(value => value.toLowerCase() === repoOwner.toLowerCase())
    || (owners.length === 1 ? owners[0] : null);
  if (!owner && requireOwner) throw new Error('The trusted .github/CODEOWNERS must identify one Owner account; organization repositories cannot use the organization slug as a user login');
  return { owner, defaultReviewer };
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
export function requireTestStep(steps) {
  if (!Array.isArray(steps?.test) || steps.test.length === 0) throw new Error('Configure steps.test as a non-empty argv array before running AFK');
  return steps.test;
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
// AFK is deliberately a small set of deterministic GitHub operations. Product
// decisions and implementation stay in the skills; this code only assigns,
// tracks and closes work for the unattended runner.
export const afkMarker = (kind, id) => `<!-- afk-${kind} session=${id} -->`;
export const afkGh = args => jsonCommand('gh', args);
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
    project = discoveredProject(projects);
  } catch { /* Project scope or API access can be unavailable; AFK remains usable without board priority. */ }
  try {
    const matches = afkGh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', 'in:title "Review queue"', '--limit', '100', '--json', 'number,title'])
      .filter(issue => issue.title.trim().toLowerCase() === 'review queue');
    reviewQueue = matches.length === 1 ? matches[0].number : null;
  } catch { /* A missing optional queue does not block implementation. */ }
  return { ...(project !== undefined ? { project } : {}), ...(reviewQueue !== undefined ? { reviewQueue } : {}) };
}
export function cachedGithubMetadata(repo, refresh = false) {
  return readThroughLocalCache(githubMetadataPath(), repo, () => discoverGithubMetadata(repo), {
    ttlMs: workflowDefaults.github.metadataCacheHours * 3_600_000, refresh, expectedFields: ['project', 'reviewQueue'],
  });
}
export function applyGithubMetadata(cfg, metadata) {
  cfg.project ??= metadata.project;
  cfg.reviewQueue ??= metadata.reviewQueue;
  return cfg;
}
export function withRepoLock(name, action) {
  if (!heldWorkflowLocks.has(name)) throw new Error(`Workflow lock ${name} must be acquired by the CLI entry point`);
  return action();
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
export function afkExpandedPath(path) { return path.replace(/^~(?=\/|$)/, homedir()); }
