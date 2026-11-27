import './support/host-stubs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  codeownersRolesFrom,
  gitFailureLine,
} from '../../plugins/common/workflow/scripts/lib/core.mjs';
import { orphanedProcessTable, unlinkedProcessTable, cli, configPath, json, config, run, fixture, commitFixture, changeConfig, pushRecord, nativeRemote, assertNoPush } from './support/workflow-cli-fixture.mjs';

test('the Owner comes from identities.owner, else the repository owner; CODEOWNERS never names it', () => {
  assert.deepEqual(codeownersRolesFrom('* @reviewer\n', 'acme/app', 'boss'), { owner: 'boss', defaultReviewer: 'reviewer', contents: '* @reviewer\n' });
  assert.deepEqual(codeownersRolesFrom('* @reviewer\n', 'acme/app'), { owner: 'acme', defaultReviewer: 'reviewer', ownerInferred: true, contents: '* @reviewer\n' });
  assert.equal(codeownersRolesFrom('* @reviewer\n/*.rules @alice\n/*.json @bob\n', 'acme/app', 'boss').owner, 'boss');
  assert.throws(() => codeownersRolesFrom('* @reviewer @other\n', 'acme/app', 'boss'), /exactly one user/);
  assert.throws(() => codeownersRolesFrom('* @reviewer\n', 'acme/app', 'not a login'), /identities\.owner must be a GitHub login/);
});

test('a Reviewer-only CODEOWNERS passes the CLI with a configured Owner, a user repository owner, and fails naming identities.owner otherwise', t => {
  const f = fixture(t);
  const only = (c, kind) => {
    writeFileSync(join(f.main, '.github', 'CODEOWNERS'), '* @reviewer\n');
    const cfg = config({ repo: 'acme/app', implementer: 'builder', reviewer: 'reviewer', owner: c });
    writeFileSync(join(f.main, configPath), json(cfg));
    assert.equal(f.git('add', configPath, '.github/CODEOWNERS').status, 0);
    run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'roles', '--allow-empty'], { cwd: f.main });
    f.env.REMOTE_BASE_SHA = f.git('rev-parse', 'HEAD').stdout.trim();
    f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    f.env.FAKE_OWNER_KIND = kind; f.env.GH_TOKEN = 'SECRET_TOKEN';
    return f.cliRun('status');
  };
  assert.doesNotMatch(only('boss', 'Organization').stderr, /Owner|identities\.owner/);
  assert.doesNotMatch(only(null, 'User').stderr, /Owner|identities\.owner/);
  assert.match(only(null, 'Organization').stderr, /identities\.owner/);
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

test('push reads workflow config from the base branch and ignores a leftover afk block', t => {
  const f = fixture(t);
  const value = { ...config({ repo: 'acme/app', implementer: 'builder', reviewer: 'reviewer', owner: 'owner' }), afk: { maxRuns: 2, retros: 'bugs-when-empty' } };
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

test('commit validates a help-shaped message as a value', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  const result = f.cliRun('commit', '--message', '-h', '--', 'assigned.txt');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Conventional Commit/);
  assert.equal(existsSync(join(f.repo, 'assigned.txt')), true);
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

test('push takes no target branch', t => {
  const f = fixture(t);
  const result = f.cliRun('push', '--to', 'feature/held');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: push \[--owner-bootstrap\]/);
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

test('commit keeps trailers after a valid subject and refuses an invalid subject', t => {
  const f = fixture(t);
  run(f.env.REAL_GIT, ['config', 'user.name', 'Test'], { cwd: f.repo });
  run(f.env.REAL_GIT, ['config', 'user.email', 'test@example.test'], { cwd: f.repo });
  writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  const bad = f.cliRun('commit', '--message', 'bad subject\n\nCo-Authored-By: N <n@example.com>', '--', 'assigned.txt');
  assert.notEqual(bad.status, 0);
  assert.notEqual(f.cliRun('commit', '--message', '\nfix: late subject\n\nCo-Authored-By: N <n@example.com>', '--', 'assigned.txt').status, 0);
  const result = f.cliRun('commit', '--message', 'fix: a subject\n\nCo-Authored-By: N <n@example.com>', '--', 'assigned.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.linkedGit('show', '-s', '--format=%B', 'HEAD').stdout, /^fix: a subject\n\nCo-Authored-By: N <n@example.com>/);
});

test('commit accepts a CRLF subject line followed by a trailer', t => {
  const f = fixture(t);
  run(f.env.REAL_GIT, ['config', 'user.name', 'Test'], { cwd: f.repo });
  run(f.env.REAL_GIT, ['config', 'user.email', 'test@example.test'], { cwd: f.repo });
  writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  const result = f.cliRun('commit', '--message', 'fix: crlf subject\r\n\r\nCo-Authored-By: N <n@example.com>', '--', 'assigned.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.linkedGit('show', '-s', '--format=%B', 'HEAD').stdout, /Co-Authored-By: N <n@example.com>/);
});

test('commit refuses existing staged changes', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'previous.txt'), 'preserve'); writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  run(f.env.REAL_GIT, ['add', 'previous.txt'], { cwd: f.repo });
  const result = f.cliRun('commit', '--message', 'fix: protect actor', '--', 'assigned.txt');
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.linkedGit('diff', '--cached', '--name-only').stdout.trim().split('\\n'), ['previous.txt']);
});

test('commit takes staged deletions that lie within the listed paths and refuses staged paths outside them', t => {
  const f = fixture(t);
  const g = (...args) => run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: f.repo });
  writeFileSync(join(f.repo, 'old.txt'), 'old'); writeFileSync(join(f.repo, 'keep.txt'), 'keep');
  assert.equal(g('add', 'old.txt', 'keep.txt').status, 0); assert.equal(g('commit', '-qm', 'seed').status, 0);
  assert.equal(g('rm', '-q', 'old.txt').status, 0);
  writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  const result = f.cliRun('commit', '--message', 'fix: drop the old file', '--', 'old.txt', 'assigned.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.linkedGit('show', '--name-status', '--format=', 'HEAD').stdout.trim().split('\n').sort(), ['A\tassigned.txt', 'D\told.txt']);
  assert.equal(g('rm', '-q', 'keep.txt').status, 0);
  writeFileSync(join(f.repo, 'more.txt'), 'more');
  const outside = f.cliRun('commit', '--message', 'fix: more', '--', 'more.txt');
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /keep\.txt/, 'names the staged path outside the list');
  assert.deepEqual(f.linkedGit('diff', '--cached', '--name-only').stdout.trim().split('\n'), ['keep.txt']);
});

test('commit names a brace-shorthand path it cannot stage', t => {
  const f = fixture(t); writeFileSync(join(f.repo, 'a.txt'), 'a');
  const result = f.cliRun('commit', '--message', 'fix: braces', '--', 'src/{a,b}.txt');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /src\/\{a,b\}\.txt/);
  assert.match(result.stderr, /brace/i);
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

test('owner bootstrap uses configured Reviewer while Owner comes from the branch config', t => {
  const f = fixture(t);
  assert.equal(run(f.env.REAL_GIT, ['rm', '-q', configPath], { cwd: f.main }).status, 0);
  writeFileSync(join(f.main, '.github', 'CODEOWNERS'), '* @reviewer\n');
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = run(f.env.REAL_GIT, ['rev-parse', 'HEAD'], { cwd: f.main }).stdout.trim();
  f.env.FAKE_ACTOR = 'owner'; f.env.AUTH_USERS_FILE = join(f.root, 'auth-users.txt');
  const result = f.cliRun('push', '--owner-bootstrap');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(new Set(readFileSync(f.env.AUTH_USERS_FILE, 'utf8').trim().split(/\r?\n/)), new Set(['owner']));
  assert.equal(existsSync(f.env.PUSH_RECORD), true);
});

test('a failed Git command names its exit status and stderr cause', t => {
  const f = fixture(t);
  f.linkedGit('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/missing');
  const result = f.cliRun('issue', 'close', '--number', '1');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /git ls-tree failed \(exit 128\): fatal: Not a valid object name refs\/remotes\/origin\/missing/);
});

test('a failed command cause keeps the last stderr line, redacted and capped', () => {
  assert.equal(gitFailureLine('hint: first\nfatal: https://x:ghp_abc123@github.com/a/b token github_pat_Z9\n\n', { last: true }), 'fatal: https://[redacted]@github.com/a/b token [redacted]');
  assert.equal(gitFailureLine(`fatal: ${'x'.repeat(300)}`, { last: true, max: 200 }).length, 200);
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


test('issue edit replaces an issue body from a worktree file and confirms it', t => {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nrequire('fs').appendFileSync(process.env.TEST_CALLS, a.join(' ')+'\\n');\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a.includes('PATCH')) { const body=a.find(x=>x.startsWith('body=')).slice(5); out({number:4, body: process.env.TEST_DROP ? 'stale' : body}); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nout({}); process.exit(0);\n`);
  chmodSync(gh, 0o755);
  const cfg = { ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] } };
  writeFileSync(join(f.repo, configPath), json(cfg));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  writeFileSync(join(f.repo, 'body.md'), '## Outcome\nWaiting: #14 on the payment sandbox');
  f.env.TEST_CALLS = join(f.root, 'calls.log');
  const edited = f.cliRun('issue', 'edit', '--number', '4', '--body-file', 'body.md');
  assert.equal(edited.status, 0, edited.stderr);
  assert.match(edited.stdout, /Edited #4/);
  assert.match(readFileSync(f.env.TEST_CALLS, 'utf8'), /-X PATCH repos\/acme\/app\/issues\/4 -f body=## Outcome\nWaiting: #14 on the payment sandbox/);
  f.env.TEST_DROP = '1';
  const dropped = f.cliRun('issue', 'edit', '--number', '4', '--body-file', 'body.md');
  assert.notEqual(dropped.status, 0);
  assert.match(dropped.stderr, /did not confirm #4/);
});
test('issue close as completed needs a merged closing PR, a fold marker or a no-change statement; not planned is unaffected', t => {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node
const a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));
require('fs').appendFileSync(process.env.TEST_CALLS, a.join(' ')+'\\n');
if(a[0]==='auth'){console.log('SECRET_TOKEN');process.exit(0);}
if(a.includes('user')){out({login:'builder'});process.exit(0);}
if(a.includes('PATCH')){out({state:'closed'});process.exit(0);}
if(a.includes('graphql')){out({data:{repository:{issue:{closedByPullRequestsReferences:{nodes:JSON.parse(process.env.TEST_PRS||'[]')}}}}});process.exit(0);}
if(a.some(x=>/issues\\/4$/.test(x))){out({number:4,state:'open',body:process.env.TEST_BODY||'Do the thing.',labels:[]});process.exit(0);}
out({});
`);
  chmodSync(gh, 0o755);
  writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] } }));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.TEST_CALLS = join(f.root, 'calls.log');
  const refused = f.cliRun('issue', 'close', '--number', '4');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /closing PR/);
  assert.match(refused.stderr, /consolidated-into/);
  assert.match(refused.stderr, /Make no repository changes/);
  assert.doesNotMatch(readFileSync(f.env.TEST_CALLS, 'utf8'), /PATCH/);
  f.env.TEST_PRS = JSON.stringify([{ merged: true, baseRefName: 'other' }, { merged: false, baseRefName: 'main' }]);
  assert.notEqual(f.cliRun('issue', 'close', '--number', '4').status, 0);
  f.env.TEST_PRS = JSON.stringify([{ merged: true, baseRefName: 'main' }]);
  assert.equal(f.cliRun('issue', 'close', '--number', '4').status, 0);
  delete f.env.TEST_PRS;
  f.env.TEST_BODY = 'Folded.\n<!-- workflow:consolidated-into 9 -->';
  assert.equal(f.cliRun('issue', 'close', '--number', '4').status, 0);
  f.env.TEST_BODY = 'Make no repository changes.';
  assert.equal(f.cliRun('issue', 'close', '--number', '4').status, 0);
  f.env.TEST_BODY = 'Do the thing.';
  const notPlanned = f.cliRun('issue', 'close', '--number', '4', '--reason', 'not_planned');
  assert.equal(notPlanned.status, 0, notPlanned.stderr);
  assert.match(readFileSync(f.env.TEST_CALLS, 'utf8'), /-f state=closed -f state_reason=not_planned/);
});

test('issue edit reaches the public tooling repository from a private consumer and refuses a leaking body', t => {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nrequire('fs').appendFileSync(process.env.TEST_CALLS, a.join(' ')+'\\n');\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a.includes('PATCH')) { out({number:4, body:a.find(x=>x.startsWith('body=')).slice(5)}); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({private:true}); process.exit(0); }\nif(a.includes('repos/acme/skills')) { out({private:false}); process.exit(0); }\nout({}); process.exit(0);\n`);
  chmodSync(gh, 0o755);
  writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, github: { toolingRepository: 'https://github.com/acme/skills.git' } }));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.TEST_CALLS = join(f.root, 'calls.log');
  writeFileSync(join(f.repo, 'body.md'), 'Sharpen the review rule');
  const edited = f.cliRun('issue', 'edit', '--number', '4', '--body-file', 'body.md', '--repo', 'acme/skills');
  assert.equal(edited.status, 0, edited.stderr);
  assert.match(readFileSync(f.env.TEST_CALLS, 'utf8'), /-X PATCH repos\/acme\/skills\/issues\/4 -f body=Sharpen the review rule/);
  writeFileSync(join(f.repo, 'leak.md'), 'Seen in acme/app');
  const leaked = f.cliRun('issue', 'edit', '--number', '4', '--body-file', 'leak.md', '--repo', 'acme/skills');
  assert.notEqual(leaked.status, 0);
  assert.match(leaked.stderr, /remove the name app/);
});
test('issue status reports a repository without a board, and errors for tied boards, failed discovery or an unknown value', t => {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nrequire('fs').appendFileSync(process.env.TEST_CALLS, a.join(' ')+'\\n');\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nout({}); process.exit(0);\n`);
  chmodSync(gh, 0o755);
  writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] } }));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.TEST_CALLS = join(f.root, 'calls.log');
  const seed = fields => writeFileSync(join(f.main, '.git', 'workflow-metadata-cache.json'), JSON.stringify({ 'acme/app': { fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { at: Date.now(), value }])) } }));
  const status = value => f.cliRun('issue', 'status', '--number', '4', '--value', value);

  seed({ project: false });
  const none = status('Todo');
  assert.equal(none.status, 0, none.stderr);
  assert.match(none.stdout, /no GitHub Project board; status skipped \(use priority labels\)/);
  assert.doesNotMatch(readFileSync(f.env.TEST_CALLS, 'utf8'), /project|graphql/);

  seed({ project: { ambiguous: [5, 6] } });
  const tied = status('Todo');
  assert.notEqual(tied.status, 0);
  assert.match(tied.stderr, /board is ambiguous: boards #5, #6 tie/);
  assert.doesNotMatch(tied.stderr, /scopes/);

  seed({ project: null });
  const unknown = status('Todo');
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /check scopes or run `workflow\.mjs cache refresh`/);

  seed({ project: false });
  const badValue = status('Sideways');
  assert.notEqual(badValue.status, 0);
  assert.match(badValue.stderr, /Unknown status SIDEWAYS; use one of: BACKLOG, TODO, PROGRESS, BLOCKED, REVIEW, DONE/);
  assert.doesNotMatch(badValue.stderr, /scopes/);
});
function runScriptAsync(f, script, args, timeout) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script, ...args], { cwd: f.repo, env: f.env, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    let stderr = ''; let timedOut = false;
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, timeout);
    child.on('close', status => { clearTimeout(timer); resolve({ status, stderr, timedOut }); });
  });
}
function lockedIssueFixture(t) {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a[0]==='issue' && a[1]==='list') { out([{number:7,title:'Owner improvements'}]); process.exit(0); }\nif(a.some(x=>x.endsWith('/comments'))) { require('fs').appendFileSync(process.env.TEST_CALLS, a.join(' ')+'\\n'); out({id:12}); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('{}');\n`);
  chmodSync(gh, 0o755);
  writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, github: { toolingRepository: 'https://github.com/acme/skills.git' } }));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  writeFileSync(join(f.repo, 'body.md'), 'Run evidence');
  f.env.TEST_CALLS = join(f.root, 'calls.log');
  return f;
}
// A stateful fake gh: milestones v1 (3), issues whose id is 100 x number, and sub-issue and blocked-by links kept in links.json.
function structureFixture(t) {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node
const fs=require('fs'), a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));
const file=process.env.TEST_LINKS, links=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
const path=a.find(x=>x.startsWith('repos/'))||'', field=k=>{const x=a.find(v=>v.startsWith(k+'='));return x&&x.slice(k.length+1);};
fs.appendFileSync(process.env.TEST_CALLS, a.join(' ')+'\\n');
if(a[0]==='auth'){console.log('SECRET_TOKEN');process.exit(0);}
if(a.includes('user')){out({login:'builder'});process.exit(0);}
if(a[0]==='issue'&&a[1]==='list'){out([]);process.exit(0);}
if(path.includes('/milestones')){out([[{number:2,title:'v0'},{number:3,title:'v1'}]]);process.exit(0);}
const unlink=path.match(/issues\\/(\\d+)\\/(sub_issue|dependencies\\/blocked_by\\/(\\d+))$/);
if(unlink&&a.includes('DELETE')){const key=unlink[1]+(unlink[3]?'dependencies/blocked_by':'sub_issues'),gone=unlink[3]?Number(unlink[3])/100:Number(field('sub_issue_id'))/100;if(!process.env.TEST_NO_UNLINK)links[key]=(links[key]||[]).filter(x=>x!==gone);fs.writeFileSync(file,JSON.stringify(links));out({});process.exit(0);}
const link=path.match(/issues\\/(\\d+)\\/(sub_issues|dependencies\\/blocked_by)/);
if(link){const key=link[1]+link[2];
  if(a.includes('POST')){if(!process.env.TEST_NO_LINK)links[key]=[...(links[key]||[]),Number(field(link[2]==='sub_issues'?'sub_issue_id':'issue_id'))/100];fs.writeFileSync(file,JSON.stringify(links));out({});}
  else out([(links[key]||[]).map(number=>({number}))]);
  process.exit(0);}
const issue=path.match(/issues\\/(\\d+)$/);
if(issue&&a.includes('PATCH')){const m=field('milestone');out({number:Number(issue[1]),body:field('body'),milestone:m&&!process.env.TEST_NO_MILESTONE?{title:'v1'}:null});process.exit(0);}
if(issue){out({id:Number(issue[1])*100,number:Number(issue[1]),labels:[{name:{1:'type:epic',5:'type:epic',4:'type:story'}[issue[1]]||'type:story'}]});process.exit(0);}
if(path.endsWith('/issues')){const m=field('milestone');out({number:9,milestone:m&&!process.env.TEST_NO_MILESTONE?{title:'v1'}:null});process.exit(0);}
out({});
`);
  chmodSync(gh, 0o755);
  writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] } }));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  writeFileSync(join(f.repo, 'body.md'), 'Body text');
  f.env.TEST_CALLS = join(f.root, 'calls.log');
  f.env.TEST_LINKS = join(f.root, 'links.json');
  return f;
}
const calls = f => readFileSync(f.env.TEST_CALLS, 'utf8');
const links = f => JSON.parse(readFileSync(f.env.TEST_LINKS, 'utf8'));

test('issue edit sets a milestone by name without a body file and confirms it', t => {
  const f = structureFixture(t);
  const result = f.cliRun('issue', 'edit', '--number', '4', '--milestone', 'v1');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Edited #4/);
  assert.match(calls(f), /-X PATCH repos\/acme\/app\/issues\/4 -F milestone=3/);
  assert.doesNotMatch(calls(f), /body=/);
  f.env.TEST_NO_MILESTONE = '1';
  const dropped = f.cliRun('issue', 'edit', '--number', '4', '--milestone', 'v1');
  assert.match(dropped.stderr, /did not confirm #4 in milestone v1/);
  const unknown = f.cliRun('issue', 'edit', '--number', '4', '--milestone', 'nope');
  assert.match(unknown.stderr, /no milestone named nope/);
});

test('issue edit links a parent epic once and confirms it from GitHub', t => {
  const f = structureFixture(t);
  for (let run = 0; run < 2; run++) {
    const result = f.cliRun('issue', 'edit', '--number', '4', '--parent', '1');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Linked #4 under #1/);
  }
  assert.deepEqual(links(f)['1sub_issues'], [4]);
  assert.equal(calls(f).split('\n').filter(line => /POST .*issues\/1\/sub_issues -F sub_issue_id=400/.test(line)).length, 1);
  rmSync(f.env.TEST_LINKS); f.env.TEST_NO_LINK = '1';
  assert.match(f.cliRun('issue', 'edit', '--number', '4', '--parent', '1').stderr, /did not confirm #4 under #1/);
});

test('issue edit adds each blocked-by link and skips one already present', t => {
  const f = structureFixture(t);
  assert.equal(f.cliRun('issue', 'edit', '--number', '4', '--blocked-by', '2').status, 0);
  const result = f.cliRun('issue', 'edit', '--number', '4', '--blocked-by', '2,3');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Blocked #4 by #2, #3/);
  assert.deepEqual(links(f)['4dependencies/blocked_by'], [2, 3]);
  assert.equal(f.cliRun('issue', 'edit', '--number', '4', '--blocked-by', '4').status, 1);
  assert.match(f.cliRun('issue', 'edit', '--number', '4', '--blocked-by', 'x').stderr, /--blocked-by expects issue numbers/);
});

test('issue edit drops a blocked-by link and a sub-issue link, confirms each from GitHub, and leaves an absent one alone', t => {
  const f = structureFixture(t);
  assert.equal(f.cliRun('issue', 'edit', '--number', '4', '--blocked-by', '2,3', '--parent', '1').status, 0);
  const result = f.cliRun('issue', 'edit', '--number', '4', '--unblock', '2,7', '--no-parent', '1');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unlinked #4 from under #1/);
  assert.match(result.stdout, /Unblocked #4 from #2, #7/);
  assert.deepEqual(links(f)['4dependencies/blocked_by'], [3]);
  assert.deepEqual(links(f)['1sub_issues'], []);
  assert.match(calls(f), /DELETE repos\/acme\/app\/issues\/4\/dependencies\/blocked_by\/200/);
  assert.doesNotMatch(calls(f), /DELETE .*blocked_by\/700/);
  assert.match(calls(f), /DELETE repos\/acme\/app\/issues\/1\/sub_issue -F sub_issue_id=400/);
  const again = f.cliRun('issue', 'edit', '--number', '4', '--no-parent', '1');
  assert.equal(again.status, 0, again.stderr);
  assert.equal(calls(f).split('\n').filter(line => /DELETE .*issues\/1\/sub_issue /.test(line)).length, 1);
});

test('issue edit refuses an unlink GitHub does not confirm and a contradictory or malformed one', t => {
  const f = structureFixture(t);
  assert.equal(f.cliRun('issue', 'edit', '--number', '4', '--blocked-by', '2', '--parent', '1').status, 0);
  f.env.TEST_NO_UNLINK = '1';
  assert.match(f.cliRun('issue', 'edit', '--number', '4', '--unblock', '2').stderr, /did not confirm #4 unblocked from #2/);
  assert.match(f.cliRun('issue', 'edit', '--number', '4', '--no-parent', '1').stderr, /did not confirm #4 removed from under #1/);
  assert.match(f.cliRun('issue', 'edit', '--number', '4', '--blocked-by', '2', '--unblock', '2').stderr, /name the same issue/);
  assert.match(f.cliRun('issue', 'edit', '--number', '4', '--no-parent', 'x').stderr, /--no-parent expects/);
  assert.match(f.cliRun('issue', 'edit', '--number', '4', '--unblock', 'x').stderr, /--unblock expects/);
});

test('issue edit with nothing to change prints its usage', t => {
  const f = structureFixture(t);
  assert.match(f.cliRun('issue', 'edit', '--number', '4').stderr, /Usage: issue edit --number N/);
});

test('issue create sets the milestone, parent and blocked-by links on the new issue', t => {
  const f = structureFixture(t);
  const result = f.cliRun('issue', 'create', '--title', 'Slice', '--body-file', 'body.md', '--milestone', 'v1', '--parent', '1', '--blocked-by', '2,3');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created: #9/);
  assert.match(result.stdout, /Linked #9 under #1/);
  assert.match(result.stdout, /Blocked #9 by #2, #3/);
  assert.match(calls(f), /repos\/acme\/app\/issues -f title=Slice -f body=Body text -F milestone=3/);
  assert.deepEqual(links(f)['1sub_issues'], [9]);
  assert.deepEqual(links(f)['9dependencies/blocked_by'], [2, 3]);
  f.env.TEST_NO_MILESTONE = '1';
  assert.match(f.cliRun('issue', 'create', '--title', 'Slice', '--body-file', 'body.md', '--milestone', 'v1').stderr, /did not confirm #9 in milestone v1/);
});
test('issue create and edit enforce the epic -> story|bug backlog', t => {
  const f = structureFixture(t);
  const create = (...extra) => f.cliRun('issue', 'create', '--title', 'Slice', '--body-file', 'body.md', ...extra);
  assert.match(create('--labels', 'type:epic', '--parent', '1').stderr, /is an epic and cannot sit under #1: epics are never nested/);
  assert.match(create('--labels', 'type:task', '--parent', '1').stderr, /type:task is retired/);
  assert.match(create('--labels', 'type:chore', '--parent', '1').stderr, /type:chore is retired/);
  assert.match(create('--labels', 'type:story').stderr, /needs --parent N/);
  assert.match(create('--labels', 'type:bug').stderr, /needs --parent N/);
  assert.match(create('--labels', 'type:story', '--parent', '4').stderr, /#4 is not a type:epic/);
  assert.doesNotMatch(calls(f), /issues -f title/, 'nothing was created');
  assert.equal(create('--labels', 'type:story', '--parent', '1').status, 0);
  assert.equal(create('--labels', 'type:epic').status, 0, 'a top-level epic is allowed');
  assert.match(f.cliRun('issue', 'edit', '--number', '5', '--parent', '1').stderr, /#5 is an epic and cannot sit under #1/);
  assert.match(f.cliRun('issue', 'edit', '--number', '6', '--parent', '4').stderr, /#4 is not a type:epic/);
  assert.equal(f.cliRun('issue', 'edit', '--number', '4', '--parent', '1').status, 0);
});
test('issue create refuses type:bug for a Nit-sweep body and names type:story', t => {
  const f = structureFixture(t);
  writeFileSync(join(f.repo, 'nits.md'), '<!-- workflow:nit-sweep -->\n\nNits from #1.\n');
  const create = (...extra) => f.cliRun('issue', 'create', '--title', 'Sweep nits', '--body-file', 'nits.md', '--parent', '1', ...extra);
  const refused = create('--labels', 'type:bug');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /type:story/);
  assert.doesNotMatch(calls(f), /issues -f title/, 'nothing was created');
  assert.equal(create('--labels', 'type:story').status, 0);
});
test('a locked issue command run by a relative path does not wait on its own lock', async t => {
  if (!['darwin', 'linux'].includes(process.platform)) { t.skip('workflow locks need lockf or flock'); return; }
  const f = lockedIssueFixture(t);
  // A copy inside the worktree keeps the relative path from containing the absolute one.
  cpSync(dirname(cli), join(f.repo, 'tools'), { recursive: true });
  const script = join('tools', basename(cli));
  for (const args of [['issue', 'comment', '--number', '7', '--body-file', 'body.md'], ['issue', 'create', '--title', 'Owner improvements', '--body-file', 'body.md', '--repo', 'acme/skills', '--unique']]) {
    const began = Date.now();
    const result = await runScriptAsync(f, script, args, 30000);
    assert.equal(result.timedOut, false, `${args[1]} waited on its own lock`);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(Date.now() - began < 30000);
  }
  assert.match(readFileSync(f.env.TEST_CALLS, 'utf8'), /repos\/acme\/app\/issues\/7\/comments -f body=Run evidence/);
});

test('a locked issue command completes from a path ps cannot show literally', async t => {
  if (!['darwin', 'linux'].includes(process.platform)) { t.skip('workflow locks need lockf or flock'); return; }
  const f = lockedIssueFixture(t);
  cpSync(dirname(cli), join(f.repo, 'tóols'), { recursive: true });
  const result = await runScriptAsync(f, join('tóols', basename(cli)), ['issue', 'comment', '--number', '7', '--body-file', 'body.md'], 30000);
  assert.equal(result.timedOut, false, 'the command waited on its own lock or kept re-executing');
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(f.env.TEST_CALLS, 'utf8'), /repos\/acme\/app\/issues\/7\/comments -f body=Run evidence/);
});

test('issue edit runs under its lock when the fake process table shows the lock owner as its ancestor', async t => {
  if (!['darwin', 'linux'].includes(process.platform)) { t.skip('workflow locks need lockf or flock'); return; }
  const f = structureFixture(t);
  const result = await runScriptAsync(f, cli, ['issue', 'edit', '--number', '4', '--milestone', 'v1'], 30000);
  assert.equal(result.timedOut, false, 'the accepted ancestry still waited on its own lock');
  assert.equal(result.status, 0, result.stderr);
  assert.match(calls(f), /-X PATCH repos\/acme\/app\/issues\/4 -F milestone=3/);
});

test('issue edit refuses an inherited lock when the fake process table lacks the owner ancestry', async t => {
  if (!['darwin', 'linux'].includes(process.platform)) { t.skip('workflow locks need lockf or flock'); return; }
  const f = structureFixture(t);
  writeFileSync(f.env.WORKFLOW_TEST_PROCESS_TABLE, orphanedProcessTable);
  const result = await runScriptAsync(f, cli, ['issue', 'edit', '--number', '4', '--milestone', 'v1'], 5000);
  // A refused context queues for the lock its owner still holds, so the command never runs.
  assert.equal(result.timedOut, true, 'the rejected ancestry was accepted');
  assert.doesNotMatch(existsSync(f.env.TEST_CALLS) ? calls(f) : '', /-X PATCH/);
});

test('issue edit refuses an inherited lock when the owner is a workflow process the child does not descend from', async t => {
  // flock -F execs in place, so on Linux the child's real parent is the owner and the walk accepts it before the table is read; lockf sits between them on macOS.
  if (process.platform !== 'darwin') { t.skip('only macOS puts a lock command between owner and child'); return; }
  const f = structureFixture(t);
  writeFileSync(f.env.WORKFLOW_TEST_PROCESS_TABLE, unlinkedProcessTable);
  const result = await runScriptAsync(f, cli, ['issue', 'edit', '--number', '4', '--milestone', 'v1'], 5000);
  assert.equal(result.timedOut, true, 'an owner that is a workflow process does not vouch for an unrelated child');
  assert.doesNotMatch(existsSync(f.env.TEST_CALLS) ? calls(f) : '', /-X PATCH/);
});

test('without the fake process table issue edit reads the real process table through ps', async t => {
  if (!['darwin', 'linux'].includes(process.platform)) { t.skip('workflow locks need lockf or flock'); return; }
  const f = structureFixture(t);
  delete f.env.WORKFLOW_TEST_PROCESS_TABLE;
  const record = join(f.root, 'ps-calls.log');
  const ps = join(f.root, 'bin', 'ps');
  writeFileSync(ps, `#!/bin/sh\necho "$@" >> '${record}'\nexit 1\n`);
  chmodSync(ps, 0o755);
  await runScriptAsync(f, cli, ['issue', 'edit', '--number', '4', '--milestone', 'v1'], 5000);
  assert.match(readFileSync(record, 'utf8'), /^-axo pid=,ppid=,command=$/m);
});

test('a usage error on a locked command reports only the usage message', t => {
  const f = fixture(t);
  const result = f.cliRun('issue', 'edit', '--number', '304', '--body-file', 'F', '--bogus', '12.0.0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected --number --body-file --repo --milestone --parent --blocked-by --no-parent --unblock/);
  assert.doesNotMatch(result.stderr, /\block\b/);
});

// A stateful fake gh for the duplicate search: issues live in issues.json; creates, comments and state changes are recorded in it.
function duplicateFixture(t, existing) {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node
const fs=require('fs'), a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));
const file=process.env.TEST_ISSUES, db=JSON.parse(fs.readFileSync(file,'utf8')), save=()=>fs.writeFileSync(file,JSON.stringify(db));
const path=a.find(x=>x.startsWith('repos/'))||'', field=k=>{const x=a.find(v=>v.startsWith(k+'='));return x&&x.slice(k.length+1);};
if(a[0]==='auth'){console.log('SECRET_TOKEN');process.exit(0);}
if(a.includes('user')){out({login:'builder'});process.exit(0);}
if(a[0]==='issue'&&a[1]==='list'){const st=a[a.indexOf('--state')+1];db.lists.push(a.join(' '));save();out(db.issues.filter(x=>st==='open'?x.state!=='CLOSED':st==='closed'?x.state==='CLOSED':true));process.exit(0);}
const comment=path.match(/issues\\/(\\d+)\\/comments$/);
if(comment){db.comments.push({number:Number(comment[1]),body:field('body')});save();out({id:1});process.exit(0);}
const sub=path.match(/issues\\/(\\d+)\\/sub_issues/);
if(sub){if(a.includes('POST')){db.sub.push(Number(field('sub_issue_id'))/100);save();out({});}else out([db.sub.map(number=>({number}))]);process.exit(0);}
const one=path.match(/issues\\/(\\d+)$/);
if(one&&a.includes('PATCH')){const i=db.issues.find(x=>x.number===Number(one[1]));if(field('state')==='open')i.state='OPEN';db.patches.push(a.join(' '));save();out({number:i.number});process.exit(0);}
if(one){out({id:Number(one[1])*100,number:Number(one[1]),labels:[{name:'type:epic'}]});process.exit(0);}
if(path.endsWith('/issues')){
  if(db.issues.length&&process.env.TEST_SLOW)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);
  const number=100+db.creates.length;db.creates.push({number,title:field('title'),body:field('body')});db.issues.push({number,title:field('title'),body:field('body'),state:'OPEN',closedAt:null});save();out({number});process.exit(0);}
out({});
`);
  chmodSync(gh, 0o755);
  writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] } }));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.TEST_ISSUES = join(f.root, 'issues.json');
  writeFileSync(f.env.TEST_ISSUES, JSON.stringify({ issues: existing, creates: [], comments: [], patches: [], sub: [], lists: [] }));
  return f;
}
const packet = paths => `\u0060\u0060\u0060scope\n${JSON.stringify({ paths })}\n\u0060\u0060\u0060`;
const daysAgo = days => new Date(Date.now() - days * 86_400_000).toISOString();
const dupState = f => JSON.parse(readFileSync(f.env.TEST_ISSUES, 'utf8'));
const FAULT = 'drive loses the claim when the push fails';
const faultBody = `The claim is lost when the push fails in drive.\nObserved: the claim is gone. Expected: the claim is kept.\n${packet(['plugins/common/workflow/scripts/drive.mjs'])}`;
const filed = (f, title, body, ...extra) => {
  writeFileSync(join(f.repo, 'dup.md'), body);
  return f.cliRun('issue', 'create', '--title', title, '--body-file', 'dup.md', '--parent', '1', ...extra);
};

for (const type of ['type:bug', 'type:story']) {
  test(`issue create of a ${type} matching an open issue creates nothing, comments the evidence and prints Exists`, t => {
    const f = duplicateFixture(t, [{ number: 40, title: FAULT, body: faultBody, state: 'OPEN', closedAt: null }]);
    const result = filed(f, 'Drive loses its claim after a failed push', faultBody, '--labels', type);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Exists: #40/);
    const db = dupState(f);
    assert.equal(db.creates.length, 0, 'no create call was made');
    assert.equal(db.comments.length, 1);
    assert.equal(db.comments[0].number, 40);
    assert.match(db.comments[0].body, /claim is lost when the push fails/);
  });
}

test('a closed match is found within 30 days and reopened; one closed 31 days ago is not', t => {
  const recent = duplicateFixture(t, [{ number: 41, title: FAULT, body: faultBody, state: 'CLOSED', closedAt: daysAgo(29) }]);
  const found = filed(recent, FAULT, faultBody, '--labels', 'type:bug');
  assert.equal(found.status, 0, found.stderr);
  assert.match(found.stdout, /Exists: #41/);
  assert.match(found.stdout, /Reopened: #41/);
  assert.equal(dupState(recent).creates.length, 0);
  assert.match(dupState(recent).patches.join('\n'), /PATCH repos\/acme\/app\/issues\/41 .*state=open/);
  const old = duplicateFixture(t, [{ number: 42, title: FAULT, body: faultBody, state: 'CLOSED', closedAt: daysAgo(31) }]);
  const created = filed(old, FAULT, faultBody, '--labels', 'type:bug');
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Created: #100/);
  assert.equal(dupState(old).comments.length, 0);
});

test('a body sharing a scope path but describing a different behaviour creates a new issue', t => {
  const f = duplicateFixture(t, [{ number: 40, title: FAULT, body: faultBody, state: 'OPEN', closedAt: null }]);
  const other = `Render the wave table as a sortable grid for narrow screens.\n${packet(['plugins/common/workflow/scripts/drive.mjs'])}`;
  const result = filed(f, 'Sortable wave table on narrow screens', other, '--labels', 'type:story');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created: #100/);
  assert.equal(dupState(f).comments.length, 0);
});

test('the same behaviour in a path outside the scope creates a new issue', t => {
  const f = duplicateFixture(t, [{ number: 40, title: FAULT, body: faultBody, state: 'OPEN', closedAt: null }]);
  const elsewhere = `The claim is lost when the push fails in drive.\nObserved: the claim is gone. Expected: the claim is kept.\n${packet(['docs/elsewhere.md'])}`;
  assert.match(filed(f, FAULT, elsewhere, '--labels', 'type:bug').stdout, /Created: #100/);
});

test('a scope-less body matches an open scope-less issue with the same outcome and creates nothing', t => {
  const bare = 'The claim is lost when the push fails in drive. Observed: the claim is gone. Expected: the claim is kept.';
  const f = duplicateFixture(t, [{ number: 40, title: FAULT, body: bare, state: 'OPEN', closedAt: null }]);
  const result = filed(f, FAULT, bare, '--labels', 'type:bug');
  assert.match(result.stdout, /Exists: #40/);
  assert.equal(dupState(f).creates.length, 0);
  assert.equal(dupState(f).comments.length, 1);
});

test('a recently closed main-red bug without a scope packet is reopened when the base goes red again', t => {
  const title = 'fix(drive): main is red, verify fails';
  const body = '## Why\nmain is red.\n\n## Evidence\nRequired check `verify` fails on `main`: https://x/runs/1\n\n<!-- workflow:base-red -->\n';
  const f = duplicateFixture(t, [{ number: 40, title, body, state: 'CLOSED', closedAt: daysAgo(3) }]);
  const result = filed(f, title, body.replace('runs/1', 'runs/2'), '--labels', 'type:bug');
  assert.match(result.stdout, /Reopened: #40/);
  assert.match(result.stdout, /Exists: #40/);
  assert.equal(dupState(f).creates.length, 0);
});

test('two concurrent issue creates for the same issue create one under the repo lock', async t => {
  if (!['darwin', 'linux'].includes(process.platform)) { t.skip('workflow locks need lockf or flock'); return; }
  const f = duplicateFixture(t, []);
  f.env.TEST_SLOW = '1';
  writeFileSync(join(f.repo, 'dup.md'), faultBody);
  const args = ['issue', 'create', '--title', FAULT, '--body-file', 'dup.md', '--parent', '1', '--labels', 'type:bug'];
  const runs = await Promise.all([runScriptAsync(f, cli, args, 60000), runScriptAsync(f, cli, args, 60000)]);
  for (const run of runs) assert.equal(run.status, 0, run.stderr);
  const db = dupState(f);
  assert.equal(db.creates.length, 1);
  assert.equal(db.comments.length, 1);
  assert.equal(db.patches.length, 0, 'the post-create exact-title close did not fire');
});

test('--distinct-from with a reason creates the issue and records it; without a reason it prints usage', t => {
  const f = duplicateFixture(t, [{ number: 40, title: FAULT, body: faultBody, state: 'OPEN', closedAt: null }]);
  const bare = filed(f, FAULT, faultBody, '--labels', 'type:bug', '--distinct-from', '40');
  assert.notEqual(bare.status, 0);
  assert.match(bare.stderr, /Usage: issue create/);
  assert.match(bare.stderr, /--distinct-from N --reason/);
  assert.equal(dupState(f).creates.length, 0);
  const result = filed(f, FAULT, faultBody, '--labels', 'type:bug', '--distinct-from', '40', '--reason', 'Different host, same symptom');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created: #100/);
  assert.match(dupState(f).creates[0].body, /Distinct from #40: Different host, same symptom/);
});

test('the duplicate search lists open issues and recently closed ones separately, never one capped all-state page', t => {
  const f = duplicateFixture(t, [{ number: 40, title: FAULT, body: faultBody, state: 'CLOSED', closedAt: daysAgo(2) }]);
  const result = filed(f, FAULT, faultBody, '--labels', 'type:bug');
  assert.match(result.stdout, /Exists: #40/);
  const lists = dupState(f).lists.join('\n');
  assert.match(lists, /--state open /);
  assert.match(lists, /--state closed --search closed:>=\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(lists, /--state all/);
});
test('issue create refuses a type:bug slice of an epic that reports no failing behaviour and names type:story', t => {
  const f = structureFixture(t);
  writeFileSync(join(f.repo, 'slice.md'), '## Problem\nExtract the shared parser into one home.\n\n## Acceptance criteria\n- [ ] one parser\n');
  writeFileSync(join(f.repo, 'fault.md'), '## Problem\nObserved: the export drops the last row. Expected: every row is exported.\n\n## Acceptance criteria\n- [ ] a reproducing test fails before the fix\n');
  const create = (file, ...extra) => f.cliRun('issue', 'create', '--title', 'Parser work', '--body-file', file, '--parent', '1', ...extra);
  const refused = create('slice.md', '--labels', 'type:bug');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /type:story/);
  assert.doesNotMatch(calls(f), /issues -f title/, 'nothing was created');
  assert.equal(create('fault.md', '--labels', 'type:bug').status, 0, 'a reported failing behaviour is a bug');
  assert.equal(create('slice.md', '--labels', 'type:story').status, 0, 'a slice is a story');
});
test('issue create refuses a type:bug epic child titled as planned work even when its body reads like a fault', t => {
  const f = structureFixture(t);
  writeFileSync(join(f.repo, 'fault.md'), '## Problem\nObserved: cold start takes 4s. Expected: under 2s.\n\n## Acceptance criteria\n- [ ] a failing test pins the budget\n');
  const create = (title, ...extra) => f.cliRun('issue', 'create', '--title', title, '--body-file', 'fault.md', '--parent', '1', ...extra);
  for (const title of ['perf(companion): cold start budget', 'test(companion): cover the pairing flow', 'refactor(adapters): one parser', 'feat(api): add export']) {
    const refused = create(title, '--labels', 'type:bug');
    assert.notEqual(refused.status, 0, title);
    assert.match(refused.stderr, /type:story/, title);
  }
  assert.doesNotMatch(calls(f), /issues -f title/, 'nothing was created');
  assert.equal(create('fix(export): last row dropped', '--labels', 'type:bug').status, 0, 'a fix-titled fault is a bug');
  assert.equal(create('perf(companion): cold start budget', '--labels', 'type:story').status, 0, 'planned work is a story');
});

const sliceBody = `Part of epic #1819.\nOne shared adapter replaces the nine copies; a regression test pins it.\n${packet(['plugins/common/workflow/scripts/lib/issues.mjs'])}`;
const filedBare = (f, title, body, ...extra) => {
  writeFileSync(join(f.repo, 'dup.md'), body);
  return f.cliRun('issue', 'create', '--title', title, '--body-file', 'dup.md', '--parent', '1', ...extra);
};

test('issue create refuses a type:bug that opens as a slice of planned work and names type:story', t => {
  for (const opening of ['Part of epic #1819.', 'Split from #1983.']) {
    const f = duplicateFixture(t, []);
    const result = filedBare(f, 'One shared adapter', sliceBody.replace('Part of epic #1819.', opening), '--labels', 'type:bug');
    assert.notEqual(result.status, 0, opening);
    assert.match(result.stderr, /type:story/);
    assert.equal(dupState(f).creates.length, 0);
  }
});

test('a heading line before "Part of epic" still opens a slice, and an observed/expected pair on separate lines or a reproduction counts as a failing behaviour', t => {
  const headed = duplicateFixture(t, []);
  const refused = filedBare(headed, 'One shared adapter', `## Why\n${sliceBody}`, '--labels', 'type:bug');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /type:story/);
  for (const [name, body] of [['split lines', 'The claim is lost.\nObserved: the claim is gone.\nExpected: the claim is kept.'], ['reproduction', 'The claim is lost; reproduce it by pushing a failing branch.']]) {
    const f = duplicateFixture(t, []);
    const result = filedBare(f, 'Drive loses the claim', `${body}\n${packet(['plugins/common/workflow/scripts/drive.mjs'])}`, '--labels', 'type:bug');
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});

test('a slice-opening type:bug with an observed failure, and a type:story slice, still create', t => {
  const failing = duplicateFixture(t, []);
  const bug = filedBare(failing, 'Drive loses the claim', `Part of epic #1819.\n${faultBody}`, '--labels', 'type:bug');
  assert.equal(bug.status, 0, bug.stderr);
  assert.equal(dupState(failing).creates.length, 1);
  const story = duplicateFixture(t, []);
  const result = filedBare(story, 'One shared adapter', sliceBody, '--labels', 'type:story');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(dupState(story).creates.length, 1);
});
