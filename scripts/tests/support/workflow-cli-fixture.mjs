import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const cli = join(root, 'plugins/common/workflow/scripts/workflow.mjs');
const configPath = '.agents/config.json';
const json = value => JSON.stringify(value);
const config = values => ({
  version: 1,
  identities: Object.fromEntries(['implementer', 'reviewer'].filter(key => values[key] !== undefined).map(key => [key, values[key]])),
});
const fakeGh = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const out = value => process.stdout.write(JSON.stringify(value) + '\\n');
const reviewThreads = () => {
  const logged = process.env.GH_LOG && fs.existsSync(process.env.GH_LOG) ? fs.readFileSync(process.env.GH_LOG, 'utf8').split('\\n') : [];
  const posted = process.env.REVIEW_RECORD && fs.existsSync(process.env.REVIEW_RECORD);
  const nodes = [...JSON.parse(process.env.REVIEW_THREADS), ...(posted && process.env.REVIEW_THREADS_AFTER ? JSON.parse(process.env.REVIEW_THREADS_AFTER) : [])];
  return nodes.map(node => ({ ...node, isResolved: node.isResolved || logged.includes('resolve ' + node.id) }));
};
if (args[0] === 'auth' && args[1] === 'token') {
  if (process.env.FAIL_GH_NETWORK) { process.stderr.write('error connecting to github.com SECRET_TOKEN'); process.exit(1); }
  if (process.env.GH_TOKEN || process.env.GH_HOST) process.exit(1);
  if (process.env.AUTH_USERS_FILE) fs.appendFileSync(process.env.AUTH_USERS_FILE, (args.includes('--user') ? args[args.indexOf('--user') + 1] : 'ACTIVE') + '\\n');
  process.stdout.write('SECRET_TOKEN\\n');
} else if (args[0] === 'api' && args[1] === 'graphql') {
  if (args.some(arg => arg.includes('ref(qualifiedName:'))) {
    if (process.env.GH_TOKEN !== 'SECRET_TOKEN') process.exit(1);
    if (process.env.HOOK_TO_REPLACE) fs.writeFileSync(process.env.HOOK_TO_REPLACE, '#!/bin/sh\\nprintf replaced > "$HOOK_RECORD"\\n');
    const oid = process.env.REMOTE_BRANCH_SHA;
    out(process.env.BRANCH_QUERY_ERROR ? { errors: [{ message: 'missing access' }], data: { repository: { ref: null } } } : { data: { repository: { ref: oid ? { target: { oid } } : null } } });
  } else if (args.some(arg => arg.includes('resolveReviewThread'))) {
    if (process.env.GH_TOKEN !== 'SECRET_TOKEN') process.exit(1);
    if (process.env.FAIL_RESOLVE) process.exit(1);
    const id = args.find(arg => arg.startsWith('threadId=')).slice('threadId='.length);
    if (process.env.GH_LOG) fs.appendFileSync(process.env.GH_LOG, 'resolve ' + id + '\\n');
    out({ data: { resolveReviewThread: { thread: { isResolved: true } } } });
  } else if (process.env.REVIEW_THREADS && args.some(arg => arg.includes('reviewThreads'))) out({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false }, nodes: reviewThreads() } } } } });
  else out({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false, isOutdated: false }] } } } } });
} else if (args[0] === 'api' && args.some(arg => arg.startsWith('repos/acme/app/rules/branches/'))) {
  if (!process.env.BRANCH_RULES) process.exit(1);
  out(JSON.parse(process.env.BRANCH_RULES));
} else if (args[0] === 'api') {
  if (process.env.GH_TOKEN !== 'SECRET_TOKEN') process.exit(1);
  const review = args.find(arg => /^repos\\/acme\\/app\\/pulls\\/\\d+\\/reviews$/.test(arg));
  if (review) {
    if (process.env.FAIL_REVIEW_POST) { process.stderr.write('post rejected SECRET_TOKEN'); process.exit(1); }
    if (process.env.REVIEW_RECORD) fs.writeFileSync(process.env.REVIEW_RECORD, JSON.stringify({ token: process.env.GH_TOKEN, payload: JSON.parse(fs.readFileSync(0, 'utf8')) }));
    if (process.env.GH_LOG) fs.appendFileSync(process.env.GH_LOG, 'post\\n');
    out({ id: 7 });
    process.exit(0);
  }
  if (args.includes('user') && process.env.RACE_URL_TARGET) require('node:child_process').spawnSync(process.env.REAL_GIT, ['config', 'url.' + process.env.RACE_URL_TARGET + '.insteadOf', process.env.TEST_NATIVE_REMOTE], { cwd: process.cwd() });
  if (args.some(arg => arg.includes('collaborators/') && arg.includes('/permission'))) out({ role_name: 'admin' });
  else if (args.some(arg => arg.startsWith('repos/acme/app/issues/') && arg.endsWith('/comments'))) out([!process.env.HOLD_COMMENTS_ISSUE || args.some(arg => arg.endsWith('/issues/' + process.env.HOLD_COMMENTS_ISSUE + '/comments')) ? JSON.parse(process.env.HOLD_COMMENTS || '[]') : []]);
  else if (args.includes('repos/acme/app')) out({ default_branch: 'main', owner: { type: process.env.FAKE_OWNER_KIND || 'Organization', login: 'acme' } });
  else if (args.includes('repos/acme/app/branches/main')) out({ commit: { sha: process.env.REMOTE_BASE_SHA } });
  else if (args.some(arg => arg.startsWith('repos/acme/app/issues/') && /^\\d+$/.test(arg.split('/').at(-1))) && args.includes('state=open')) { fs.writeFileSync(process.env.ISSUE_STATE_RECORD, JSON.stringify(args)); out({ state: 'open' }); }
  else if (args.some(arg => /^repos\\/acme\\/app\\/issues\\/\\d+\\/sub_issues$/.test(arg))) out([JSON.parse(process.env.SUB_ISSUES || '[]')]);
  else if (process.env.FAKE_ISSUE_BODY && args.some(arg => /^repos\\/acme\\/app\\/issues\\/\\d+$/.test(arg))) out({ body: process.env.FAKE_ISSUE_BODY });
  else {
    const actor = process.env.FAKE_ACTOR || 'builder';
    process.stdout.write(args.includes('--jq') ? actor + '\\n' : JSON.stringify({ login: actor, id: 4242 }) + '\\n');
  }
} else if (args[0] === 'pr' && (args[1] === 'edit' || args[1] === 'comment')) {
  if (process.env.FAIL_PR_EDIT && args[1] === 'edit') process.exit(1);
  if (process.env.GH_LOG) fs.appendFileSync(process.env.GH_LOG, args.slice(0, 2).join(' ') + ' ' + args.slice(2).join(' ') + '\\n');
} else if (args[0] === 'pr' && (args[1] === 'ready' || args[1] === 'merge')) {
  if (process.env.GH_LOG) fs.appendFileSync(process.env.GH_LOG, args.join(' ') + '\\n');
} else if (args[0] === 'pr' && args[1] === 'view' && process.env.PR_VIEW) {
  const merged = process.env.GH_LOG && fs.existsSync(process.env.GH_LOG) && fs.readFileSync(process.env.GH_LOG, 'utf8').includes('pr merge');
  out(JSON.parse(merged && process.env.PR_VIEW_AFTER ? process.env.PR_VIEW_AFTER : process.env.PR_VIEW));
} else if (args[0] === 'pr' && args[1] === 'view') {
  out({ url: 'https://github.com/acme/app/pull/1', baseRefOid: process.env.BASE_SHA, headRefOid: process.env.HEAD_SHA, files: [], reviews: [], reviewDecision: 'REVIEW_REQUIRED', statusCheckRollup: [] });
} else if (args[0] === 'pr' && args[1] === 'list') out(process.env.AUTO_MERGE ? [{ number: 4, autoMergeRequest: { enabledAt: 'now' } }] : JSON.parse(process.env.OPEN_PRS || '[]').filter(pr => pr.headRefName === args[args.indexOf('--head') + 1]));
else if (args[0] === 'issue' && args[1] === 'view') out({ url: 'https://github.com/acme/app/issues/1', body: 'Acceptance', comments: [{ url: 'https://example.test/1', body: 'Decision: reuse prior policy' }] });
else process.exit(1);
`;

// A shell front passes most calls straight to Git: each Node start costs about 170 ms on a loaded Mac.
const fakeGit = `#!/bin/sh
[ "$1" = fetch ] && exit 0
for arg in "$@"; do
  [ "$arg" = push ] && exec "$FAKE_NODE" "$(dirname "$0")/git-push.cjs" "$@"
  [ "$arg" = commit ] && [ -n "$TEST_CONCURRENT_STAGE" ] && "$REAL_GIT" add unrelated.txt
done
exec "$REAL_GIT" "$@"
`;

const fakeGitPush = `const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const real = process.env.REAL_GIT;
if (process.env.TEST_PUSH_FAILURE) { process.stderr.write(process.env.FAKE_PUSH_STDERR || 'SECRET_TOKEN'); process.exit(1); }
if (process.env.TEST_NATIVE_REMOTE || process.env.TEST_PUSH_URL) {
  const replacement = process.env.TEST_NATIVE_REMOTE || process.env.TEST_PUSH_URL;
  const result = spawnSync(real, args.map(arg => arg.startsWith('https://github.com/') ? replacement : arg), { encoding: 'utf8' });
  fs.writeFileSync(process.env.PUSH_RECORD, JSON.stringify({ git_status: result.status }));
  process.stderr.write(result.stderr || '');
  process.exit(result.status ?? 1);
}
const credential = spawnSync(real, ['-c', 'credential.helper=', 'credential', 'fill'], { input: 'protocol=https\\nhost=github.com\\n\\n', encoding: 'utf8' });
const secret = credential.stdout.split('\\n').find(line => line.startsWith('password='))?.slice('password='.length);
fs.writeFileSync(process.env.PUSH_RECORD, JSON.stringify({ args, secret, environment_has_token: Object.hasOwn(process.env, 'WORKFLOW_PUSH_TOKEN') }));
process.stdout.write('remote says SECRET_TOKEN\\n');
`;

function run(program, args, options = {}) {
  return spawnSync(program, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
}
function runCliAsync(f, ...args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: f.repo, env: f.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stdout = ''; let stderr = ''; let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', value => { stdout += value; });
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, 15000);
    child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr, timedOut }); });
  });
}
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin'); mkdirSync(bin);
  const home = join(directory, 'home');
  mkdirSync(join(home, '.config', 'gh-agents'), { recursive: true });
  writeFileSync(join(home, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: {} }));
  const main = join(directory, 'repo'); mkdirSync(join(main, '.agents'), { recursive: true }); mkdirSync(join(main, '.github'), { recursive: true });
  const linked = join(directory, 'linked');
  const realGit = run('which', ['git']).stdout.trim();
  const initialConfig = config({ repo: 'acme/app', implementer: 'builder', reviewer: 'reviewer', owner: 'owner' });
  writeFileSync(join(main, configPath), json(initialConfig));
  writeFileSync(join(main, '.github', 'CODEOWNERS'), '* @reviewer\n/*.rules @owner\n');
  const git = (...args) => run(realGit, args, { cwd: main });
  assert.equal(run(realGit, ['init', '-q', '-b', 'main', main]).status, 0);
  assert.equal(git('remote', 'add', 'origin', 'https://github.com/acme/app.git').status, 0);
  assert.equal(git('add', configPath, '.github/CODEOWNERS').status, 0);
  assert.equal(git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'initial').status, 0);
  assert.equal(git('update-ref', 'refs/remotes/origin/main', 'HEAD').status, 0);
  assert.equal(git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main').status, 0);
  assert.equal(git('worktree', 'add', '-q', '-b', 'feature/test', linked, 'HEAD').status, 0);
  const writeFake = (name, content) => { const path = join(bin, name); writeFileSync(path, content); chmodSync(path, 0o755); };
  writeFake('gh', fakeGh); writeFake('git', fakeGit); writeFileSync(join(bin, 'git-push.cjs'), fakeGitPush);
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('WORKFLOW_'))),
    PATH: `${bin}:${process.env.PATH}`,
    HOME: home,
    REAL_GIT: realGit,
    FAKE_NODE: process.execPath,
    PUSH_RECORD: join(directory, 'push.json'),
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  delete env.WORKFLOW_RUN_ID; delete env.WORKFLOW_ISSUE_NUMBER;
  env.REMOTE_BASE_SHA = git('rev-parse', 'HEAD').stdout.trim();
  // A trailing options object (such as { input }) passes through to the spawn.
  const cliRun = (...args) => { const extra = typeof args.at(-1) === 'object' ? args.pop() : {}; return run(process.execPath, [cli, ...args], { cwd: linked, env, ...extra }); };
  const linkedGit = (...args) => run(realGit, args, { cwd: linked });
  return { root: directory, main, repo: linked, env, git, linkedGit, cliRun };
}
function commitFixture(f, repo = f.repo) {
  assert.equal(run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture'], { cwd: repo }).status, 0);
  assert.equal(run(f.env.REAL_GIT, ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: repo }).status, 0);
}
function changeConfig(f, values, target = f.repo) {
  writeFileSync(join(target, configPath), json(config(values)));
  assert.equal(run(f.env.REAL_GIT, ['add', configPath], { cwd: target }).status, 0);
  commitFixture(f, target);
}
function pushRecord(f) { return JSON.parse(readFileSync(f.env.PUSH_RECORD, 'utf8')); }
function nativeRemote(f) {
  const remote = join(f.root, 'remote.git');
  assert.equal(run(f.env.REAL_GIT, ['init', '--bare', '-q', remote]).status, 0);
  f.env.TEST_NATIVE_REMOTE = remote;
  return remote;
}
function hookPath(f) {
  const result = run(f.env.REAL_GIT, ['rev-parse', '--git-path', 'hooks/pre-push'], { cwd: f.repo });
  return result.stdout.trim().startsWith('/') ? result.stdout.trim() : join(f.repo, result.stdout.trim());
}
function assertNoPush(f) { assert.equal(existsSync(f.env.PUSH_RECORD), false); }

export { cli, configPath, json, config, run, runCliAsync, fixture, commitFixture, changeConfig, pushRecord, nativeRemote, hookPath, assertNoPush };
