import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { codeownersRolesFrom } from '../../plugins/common/workflow/scripts/workflow.mjs';
import { cli, configPath, json, config, run, fixture, commitFixture, changeConfig, pushRecord, nativeRemote, assertNoPush } from './support/workflow-cli-fixture.mjs';

test('CODEOWNERS roles reject an organization slug when several path owners exist', () => {
  assert.throws(() => codeownersRolesFrom('* @reviewer\n/*.rules @alice\n/*.json @bob\n', 'acme/app'), /identify one Owner account/);
  assert.deepEqual(codeownersRolesFrom('* @reviewer\n/*.rules @alice\n', 'acme/app'), { owner: 'alice', defaultReviewer: 'reviewer' });
  assert.throws(() => codeownersRolesFrom('* @reviewer\n', 'acme/app'), /identify one Owner account/);
  assert.throws(() => codeownersRolesFrom('* @reviewer @other\n/*.rules @alice\n', 'acme/app'), /exactly one user/);
});

test('push ignores repository URL rewrites added after validation', t => {
  const f = fixture(t);
  const good = nativeRemote(f);
  const evil = join(f.root, 'other.git');
  assert.equal(run(f.env.REAL_GIT, ['init', '--bare', '-q', evil]).status, 0);
  f.env.RACE_URL_TARGET = evil;
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run(f.env.REAL_GIT, ['--git-dir', good, 'rev-parse', '--verify', 'refs/heads/feature/test']).status, 0);
  assert.notEqual(run(f.env.REAL_GIT, ['--git-dir', evil, 'rev-parse', '--verify', 'refs/heads/feature/test']).status, 0);
});

test('push reads workflow config from the base branch', t => {
  const f = fixture(t);
  const value = { ...config({ repo: 'acme/app', implementer: 'builder', reviewer: 'reviewer', owner: 'owner' }), afk: { maxRuns: 2 } };
  writeFileSync(join(f.repo, configPath), json(value));
  assert.equal(run(f.env.REAL_GIT, ['add', configPath], { cwd: f.repo }).status, 0);
  commitFixture(f);
  f.env.REMOTE_BASE_SHA = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr);
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
  assert.equal(f.linkedGit('show', '-s', '--format=%an <%ae>|%cn <%ce>', 'HEAD').stdout.trim(), 'builder <4242+builder@users.noreply.github.com>|builder <4242+builder@users.noreply.github.com>');
  assert.equal(JSON.parse(result.stdout).result, 'committed');
});

test('push reports GitHub network failure without exposing diagnostics', t => {
  const f = fixture(t);
  f.env.FAIL_GH_NETWORK = '1';
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Cannot reach GitHub; check network or sandbox access and retry/);
  assert.doesNotMatch(result.stderr, /SECRET_TOKEN/);
  assertNoPush(f);
});

test('push --to outside an AFK run is refused', t => {
  const f = fixture(t);
  f.env.OPEN_PRS = JSON.stringify([{ number: 259, headRefName: 'feature/held', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: [] }]);
  const result = f.cliRun('push', '--to', 'feature/held');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires an AFK run/);
  assertNoPush(f);
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

test('commit records a stopped merge as the implementer', t => {
  const f = fixture(t);
  const g = (...args) => run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: f.repo });
  writeFileSync(join(f.repo, 'song.txt'), 'base');
  assert.equal(g('add', 'song.txt').status, 0); assert.equal(g('commit', '-qm', 'base').status, 0);
  assert.equal(g('checkout', '-qb', 'other').status, 0);
  writeFileSync(join(f.repo, 'song.txt'), 'theirs'); assert.equal(g('commit', '-qam', 'theirs').status, 0);
  assert.equal(g('checkout', '-q', 'feature/test').status, 0);
  writeFileSync(join(f.repo, 'song.txt'), 'ours'); assert.equal(g('commit', '-qam', 'ours').status, 0);
  assert.notEqual(g('merge', '--no-commit', 'other').status, 0);
  writeFileSync(join(f.repo, 'song.txt'), 'resolved');
  const result = f.cliRun('commit', '--message', 'chore: merge other', '--', 'song.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.linkedGit('show', '-s', '--format=%p|%an', 'HEAD').stdout.trim().split('|').map((v, i) => i ? v : v.split(' ').length).join('|'), '2|builder');
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

test('owner bootstrap uses configured Reviewer while Owner comes from branch CODEOWNERS', t => {
  const f = fixture(t);
  assert.equal(run(f.env.REAL_GIT, ['rm', '-q', configPath], { cwd: f.main }).status, 0);
  writeFileSync(join(f.main, '.github', 'CODEOWNERS'), '* @reviewer\n');
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = run(f.env.REAL_GIT, ['rev-parse', 'HEAD'], { cwd: f.main }).stdout.trim();
  writeFileSync(join(f.repo, '.github', 'CODEOWNERS'), '* @owner\n/*.rules @owner\n');
  assert.equal(f.linkedGit('add', '.github/CODEOWNERS').status, 0);
  assert.equal(f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'branch owner rules').status, 0);
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

