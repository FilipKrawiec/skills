import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeownersRolesFrom } from '../../plugins/common/workflow/scripts/workflow.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const cli = join(root, 'plugins/common/workflow/scripts/workflow.mjs');
const configPath = '.agents/config.json';
const json = value => JSON.stringify(value);
const config = values => ({
  version: 1,
  identities: Object.fromEntries(['implementer'].filter(key => values[key] !== undefined).map(key => [key, values[key]])),
});

test('CODEOWNERS roles reject an organization slug when several path owners exist', () => {
  assert.throws(() => codeownersRolesFrom('* @reviewer\n/*.rules @alice\n/*.json @bob\n', 'acme/app'), /identify one Owner account/);
  assert.deepEqual(codeownersRolesFrom('* @reviewer\n/*.rules @alice\n', 'acme/app'), { owner: 'alice', reviewer: 'reviewer' });
});

const fakeGh = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const out = value => process.stdout.write(JSON.stringify(value) + '\\n');
if (args[0] === 'auth' && args[1] === 'token') {
  if (process.env.GH_TOKEN || process.env.GH_HOST) process.exit(1);
  if (process.env.AUTH_USERS_FILE) fs.appendFileSync(process.env.AUTH_USERS_FILE, (args.includes('--user') ? args[args.indexOf('--user') + 1] : 'ACTIVE') + '\\n');
  process.stdout.write('SECRET_TOKEN\\n');
} else if (args[0] === 'api' && args[1] === 'graphql') {
  if (args.some(arg => arg.includes('ref(qualifiedName:'))) {
    if (process.env.GH_TOKEN !== 'SECRET_TOKEN') process.exit(1);
    if (process.env.HOOK_TO_REPLACE) fs.writeFileSync(process.env.HOOK_TO_REPLACE, '#!/bin/sh\\nprintf replaced > "$HOOK_RECORD"\\n');
    const oid = process.env.REMOTE_BRANCH_SHA;
    out(process.env.BRANCH_QUERY_ERROR ? { errors: [{ message: 'missing access' }], data: { repository: { ref: null } } } : { data: { repository: { ref: oid ? { target: { oid } } : null } } });
  } else out({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false, isOutdated: false }] } } } } });
} else if (args[0] === 'api') {
  if (process.env.GH_TOKEN !== 'SECRET_TOKEN') process.exit(1);
  if (args.some(arg => arg.includes('collaborators/') && arg.includes('/permission'))) out({ role_name: 'admin' });
  else if (args.includes('repos/acme/app')) out({ default_branch: 'main', owner: { type: process.env.FAKE_OWNER_KIND || 'Organization', login: 'acme' } });
  else if (args.includes('repos/acme/app/branches/main')) out({ commit: { sha: process.env.REMOTE_BASE_SHA } });
  else {
    const actor = process.env.FAKE_ACTOR || 'builder';
    process.stdout.write(args.includes('--jq') ? actor + '\\n' : JSON.stringify({ login: actor }) + '\\n');
  }
} else if (args[0] === 'pr' && args[1] === 'view') {
  out({ url: 'https://github.com/acme/app/pull/1', baseRefOid: process.env.BASE_SHA, headRefOid: process.env.HEAD_SHA, files: [], reviews: [], reviewDecision: 'REVIEW_REQUIRED', statusCheckRollup: [] });
} else if (args[0] === 'pr' && args[1] === 'list') out(process.env.AUTO_MERGE ? [{ number: 4, autoMergeRequest: { enabledAt: 'now' } }] : []);
else if (args[0] === 'issue' && args[1] === 'view') out({ url: 'https://github.com/acme/app/issues/1', body: 'Acceptance', comments: [{ url: 'https://example.test/1', body: 'Decision: reuse prior policy' }] });
else process.exit(1);
`;

const fakeGit = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const real = process.env.REAL_GIT;
if (args.includes('commit') && process.env.TEST_CONCURRENT_STAGE) spawnSync(real, ['add', 'unrelated.txt'], { stdio: 'inherit' });
if (!args.includes('push')) {
  const result = spawnSync(real, args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
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
  writeFake('gh', fakeGh); writeFake('git', fakeGit);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    REAL_GIT: realGit,
    PUSH_RECORD: join(directory, 'push.json'),
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  env.REMOTE_BASE_SHA = git('rev-parse', 'HEAD').stdout.trim();
  const cliRun = (...args) => run(process.execPath, [cli, ...args], { cwd: linked, env });
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

test('push reads workflow config from the base branch', t => {
  const f = fixture(t);
  const value = { ...config({ repo: 'acme/app', implementer: 'builder', reviewer: 'reviewer', owner: 'owner' }), afk: { maxRuns: 2 } };
  writeFileSync(join(f.repo, configPath), json(value));
  assert.equal(run(f.env.REAL_GIT, ['add', configPath], { cwd: f.repo }).status, 0);
  commitFixture(f);
  f.env.REMOTE_BASE_SHA = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  assert.equal(f.cliRun('push').status, 0);
});

test('commit and push refuse the main checkout', t => {
  const f = fixture(t);
  writeFileSync(join(f.main, 'assigned.txt'), 'assigned');
  for (const args of [['commit', '--message', 'fix: guard checkout', '--', 'assigned.txt'], ['push']]) {
    const result = run(process.execPath, [cli, ...args], { cwd: f.main, env: f.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /linked worktree/);
  }
  assertNoPush(f);
});

test('commit includes only assigned paths', t => {
  const f = fixture(t);
  run(f.env.REAL_GIT, ['config', 'user.name', 'Test'], { cwd: f.repo });
  run(f.env.REAL_GIT, ['config', 'user.email', 'test@example.test'], { cwd: f.repo });
  writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  writeFileSync(join(f.repo, 'unrelated.txt'), 'unrelated');
  const result = f.cliRun('commit', '--message', 'fix: protect actor', '--', 'assigned.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.linkedGit('show', '--format=', '--name-only', 'HEAD').stdout.trim().split('\\n'), ['assigned.txt']);
  assert.equal(existsSync(join(f.repo, 'unrelated.txt')), true);
  assert.equal(JSON.parse(result.stdout).result, 'committed');
});

test('commit excludes a path staged concurrently', t => {
  const f = fixture(t);
  run(f.env.REAL_GIT, ['config', 'user.name', 'Test'], { cwd: f.repo });
  run(f.env.REAL_GIT, ['config', 'user.email', 'test@example.test'], { cwd: f.repo });
  writeFileSync(join(f.repo, 'assigned.txt'), 'assigned'); writeFileSync(join(f.repo, 'unrelated.txt'), 'unrelated');
  f.env.TEST_CONCURRENT_STAGE = '1';
  const result = f.cliRun('commit', '--message', 'fix: protect actor', '--', 'assigned.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.linkedGit('show', '--format=', '--name-only', 'HEAD').stdout.trim().split('\\n'), ['assigned.txt']);
  assert.deepEqual(f.linkedGit('diff', '--cached', '--name-only').stdout.trim().split('\\n'), ['unrelated.txt']);
});

test('commit refuses existing staged changes', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'previous.txt'), 'preserve'); writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  run(f.env.REAL_GIT, ['add', 'previous.txt'], { cwd: f.repo });
  const result = f.cliRun('commit', '--message', 'fix: protect actor', '--', 'assigned.txt');
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.linkedGit('diff', '--cached', '--name-only').stdout.trim().split('\\n'), ['previous.txt']);
});

test('commit rejects invalid messages and parent paths', t => {
  const f = fixture(t); writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  for (const [message, path] of [['bad message', 'assigned.txt'], ['fix: test', '../outside']]) assert.notEqual(f.cliRun('commit', '--message', message, '--', path).status, 0);
  assert.equal(f.linkedGit('diff', '--cached', '--name-only').stdout.trim(), '');
});

test('push binds the verified credential and redacts output', t => {
  const f = fixture(t); const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr);
  const record = pushRecord(f);
  assert.equal(record.secret, 'SECRET_TOKEN'); assert.equal(record.environment_has_token, false);
  assert.ok(record.args.some(arg => arg.endsWith(':refs/heads/feature/test')));
  assert.ok(record.args.includes('--no-follow-tags')); assert.ok(record.args.includes('--recurse-submodules=no'));
  assert.ok(!`${result.stdout}${result.stderr}`.includes('SECRET_TOKEN'));
});

test('wrong actor never pushes', t => {
  const f = fixture(t); f.env.FAKE_ACTOR = 'reviewer';
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assertNoPush(f); assert.ok(!`${result.stdout}${result.stderr}`.includes('SECRET_TOKEN'));
});

test('owner bootstrap selects the CODEOWNERS owner without switching active account', t => {
  const f = fixture(t);
  assert.equal(run(f.env.REAL_GIT, ['rm', '-q', configPath], { cwd: f.main }).status, 0);
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = run(f.env.REAL_GIT, ['rev-parse', 'HEAD'], { cwd: f.main }).stdout.trim();
  f.env.FAKE_ACTOR = 'owner'; f.env.AUTH_USERS_FILE = join(f.root, 'auth-users.txt');
  const result = f.cliRun('push', '--owner-bootstrap');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(new Set(readFileSync(f.env.AUTH_USERS_FILE, 'utf8').trim().split(/\r?\n/)), new Set(['owner']));
  assert.equal(existsSync(f.env.PUSH_RECORD), true);
});

test('failed Git push never reports success or exposes its token', t => {
  const f = fixture(t); f.env.TEST_PUSH_FAILURE = '1';
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assert.ok(!result.stdout.includes('"result":"pushed"')); assert.ok(!`${result.stdout}${result.stderr}`.includes('SECRET_TOKEN'));
});

test('unrelated URL rewrites do not block push', t => {
  const f = fixture(t); f.linkedGit('config', 'url.https://example.invalid/.insteadOf', 'example:');
  assert.equal(f.cliRun('push').status, 0);
});

test('target URL rewrite cannot redirect the checked credential', t => {
  const f = fixture(t);
  f.linkedGit('remote', 'set-url', 'origin', 'git@github.com:acme/app.git');
  f.linkedGit('config', 'url.https://attacker.invalid/.insteadOf', 'https://github.com/');
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /URL rewrite/); assertNoPush(f);
});

test('reviewer as implementer is rejected before credentials', t => {
  const f = fixture(t); changeConfig(f, { repo: 'acme/app', implementer: 'reviewer', reviewer: 'reviewer', owner: 'owner' });
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});

test('push ignores uncommitted identity configuration', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, configPath), json(config({ repo: 'acme/app', implementer: 'reviewer', reviewer: 'builder', owner: 'owner' })));
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).actor, 'builder');
});

test('push ignores replacement refs for base roles', t => {
  const f = fixture(t); const original = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(f.repo, configPath), json(config({ repo: 'acme/app', implementer: 'reviewer', reviewer: 'builder', owner: 'owner' })));
  f.linkedGit('add', configPath); f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'replacement');
  const replacement = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  f.linkedGit('reset', '--hard', '-q', original); f.linkedGit('replace', original, replacement);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).actor, 'builder');
});

test('push refuses owner as implementer', t => {
  const f = fixture(t); changeConfig(f, { repo: 'acme/app', implementer: 'owner', reviewer: 'reviewer', owner: 'owner' });
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});

test('repo, base, owner and reviewer are derived from origin and CODEOWNERS', t => {
  const f = fixture(t);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).repository, 'acme/app');
});

test('push refuses when auto-merge is enabled', t => {
  const f = fixture(t); f.env.AUTO_MERGE = '1';
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});

test('stale base configuration is rejected', t => {
  const f = fixture(t); f.env.REMOTE_BASE_SHA = 'f'.repeat(40);
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});

test('push ignores inherited GitHub actor and host', t => {
  const f = fixture(t); f.env.GH_TOKEN = 'WRONG_REVIEWER_TOKEN'; f.env.GH_HOST = 'invalid.example';
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(pushRecord(f).secret, 'SECRET_TOKEN');
  assert.ok(!`${result.stdout}${result.stderr}`.includes('WRONG_REVIEWER_TOKEN'));
});

test('push isolates URL-scoped credential helpers', t => {
  const f = fixture(t); const marker = join(f.root, 'helper-ran');
  f.linkedGit('config', 'credential.https://github.com.helper', `!touch ${marker}`);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(marker), false); assert.equal(pushRecord(f).secret, 'SECRET_TOKEN');
});

test('push refuses sending token to a non-GitHub host', async t => {
  const f = fixture(t); const received = [];
  const server = createServer((request, response) => {
    received.push(request.headers.authorization || null);
    response.statusCode = received.at(-1) ? 403 : 401;
    response.setHeader('Connection', 'close');
    if (!received.at(-1)) response.setHeader('WWW-Authenticate', 'Basic realm="fixture"');
    response.end();
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
  catch (error) { if (error.code === 'EPERM') { t.skip('sandbox denies localhost sockets; hosted CI runs this credential-boundary fixture'); return; } throw error; }
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const marker = join(f.root, 'unsafe-helper'); const helper = `!touch ${marker}; echo username=reviewer; echo password=WRONG`;
  f.linkedGit('config', 'credential.https://github.com.helper', helper);
  f.linkedGit('config', 'credential.https://github.com/acme/app.git.helper', helper);
  f.env.TEST_PUSH_URL = `http://127.0.0.1:${server.address().port}/acme/app.git`;
  const result = await runCliAsync(f, 'push');
  assert.notEqual(result.status, 0); assert.equal(result.timedOut, false); assert.equal(existsSync(marker), false);
  const leaked = `Basic ${Buffer.from('x-access-token:SECRET_TOKEN').toString('base64')}`;
  assert.ok(!received.includes(leaked)); assert.ok(!`${result.stdout}${result.stderr}`.includes('SECRET_TOKEN'));
});

test('push refuses scoped authorization headers', t => {
  const f = fixture(t); f.linkedGit('config', 'http.https://github.com/.extraheader', 'Authorization: secret');
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assertNoPush(f); assert.ok(!result.stderr.includes('Authorization: secret'));
});

test('installed hooks run normally without receiving credential environment', t => {
  const f = fixture(t); const remote = nativeRemote(f); const hook = hookPath(f);
  f.env.HOOK_RECORD = join(f.root, 'hook.json');
  writeFileSync(hook, `#!/bin/sh
case "$GH_TOKEN$GITHUB_TOKEN$WORKFLOW_CREDENTIAL_SOCKET" in "") token=false;; *) token=true;; esac
printf '{"token":%s}\\n' "$token" > "$HOOK_RECORD"
`); chmodSync(hook, 0o755);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(readFileSync(f.env.HOOK_RECORD, 'utf8')).token, false);
  assert.equal(run(f.env.REAL_GIT, ['--git-dir', remote, 'rev-parse', 'refs/heads/feature/test']).stdout.trim(), f.env.REMOTE_BASE_SHA);
});

test('installed hook failure stops push', t => {
  const f = fixture(t); const remote = nativeRemote(f); const hook = hookPath(f);
  writeFileSync(hook, `#!/bin/sh
exit 13
`); chmodSync(hook, 0o755);
  assert.notEqual(f.cliRun('push').status, 0);
  assert.notEqual(run(f.env.REAL_GIT, ['--git-dir', remote, 'rev-parse', '--verify', 'refs/heads/feature/test']).status, 0);
});

test('installed hooks run with SSH origin', t => {
  const f = fixture(t); const remote = nativeRemote(f); const hook = hookPath(f);
  f.linkedGit('remote', 'set-url', 'origin', 'git@github.com:acme/app.git');
  f.env.HOOK_RECORD = join(f.root, 'hook.txt'); writeFileSync(hook, `#!/bin/sh
printf ran > "$HOOK_RECORD"
`); chmodSync(hook, 0o755);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(readFileSync(f.env.HOOK_RECORD, 'utf8'), 'ran');
  assert.equal(run(f.env.REAL_GIT, ['--git-dir', remote, 'rev-parse', 'refs/heads/feature/test']).stdout.trim(), f.env.REMOTE_BASE_SHA);
});

test('push failure reports safe classification without diagnostics', t => {
  const f = fixture(t); f.env.TEST_PUSH_FAILURE = '1'; f.env.FAKE_PUSH_STDERR = 'rejected non-fast-forward SECRET_TOKEN private-detail';
  const result = f.cliRun('push');
  assert.match(result.stderr, /remote branch changed or is ahead/); assert.ok(!result.stderr.includes('SECRET_TOKEN')); assert.ok(!result.stderr.includes('private-detail'));
});

test('review context reports identical tree and unresolved threads', t => {
  const f = fixture(t); const base = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-qm', 'same tree');
  const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim(); f.env.BASE_SHA = base; f.env.HEAD_SHA = head;
  const result = f.cliRun('review-context', '--pr', '1', '--previous', base, '--previous-base', base, '--issue', '1');
  assert.equal(result.status, 0, result.stderr); const data = JSON.parse(result.stdout);
  assert.equal(data.comparison.identicalTree, true); assert.equal(data.comparison.identicalBaseTree, true); assert.equal(data.comparison.treesUnchanged, true);
  assert.equal(data.reviewThreads[0].isResolved, false); assert.match(data.issue.decisions[0].body, /Decision:/); assert.equal(data.issue.decisionsMayBeIncomplete, true);
});

test('identical head without prior base is not carryable evidence', t => {
  const f = fixture(t); const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim(); f.env.BASE_SHA = head; f.env.HEAD_SHA = head;
  const result = f.cliRun('review-context', '--pr', '1', '--previous', head);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).comparison.treesUnchanged, false);
});

test('changed base tree is not carryable evidence', t => {
  const f = fixture(t); const previous = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(f.repo, 'new-file'), 'change'); f.linkedGit('add', 'new-file');
  f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'change');
  const base = f.linkedGit('rev-parse', 'HEAD').stdout.trim(); f.env.BASE_SHA = base; f.env.HEAD_SHA = previous;
  const result = f.cliRun('review-context', '--pr', '1', '--previous', previous, '--previous-base', previous);
  assert.equal(result.status, 0, result.stderr); const data = JSON.parse(result.stdout).comparison;
  assert.equal(data.identicalTree, true); assert.equal(data.identicalBaseTree, false); assert.equal(data.treesUnchanged, false);
});

test('review context works without workflow config', t => {
  const f = fixture(t); f.linkedGit('rm', '-q', configPath);
  f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'no config');
  f.linkedGit('update-ref', 'refs/remotes/origin/main', 'HEAD'); const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  f.env.BASE_SHA = head; f.env.HEAD_SHA = head;
  const result = f.cliRun('review-context', '--pr', '1');
  assert.equal(result.status, 0, result.stderr); const data = JSON.parse(result.stdout);
  assert.equal(data.headRefOid, head); assert.equal(data.baseConfigurationAvailable, false);
});

test('push without base roles fails closed', t => {
  const f = fixture(t); f.linkedGit('rm', '-q', configPath);
  f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'no config');
  f.linkedGit('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /identities\.implementer/); assertNoPush(f);
});

test('reviewer and owner role fields in config are unnecessary when CODEOWNERS defines them', t => {
  const f = fixture(t);
  assert.equal(f.cliRun('push').status, 0);
});

test('push failure reports a safe class and exit', t => {
  const f = fixture(t); f.env.TEST_PUSH_FAILURE = '1';
  const result = f.cliRun('push');
  assert.match(result.stderr, /exit 1/); assert.match(result.stderr, /unclassified Git failure/); assert.ok(!result.stderr.includes('SECRET_TOKEN'));
});

test('remote destination mismatch is rejected', t => {
  const f = fixture(t); f.linkedGit('remote', 'set-url', 'origin', 'https://github.com/other/project.git');
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});
