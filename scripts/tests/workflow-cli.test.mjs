import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  codeownersRolesFrom,
  gitFailureLine,
} from '../../plugins/common/workflow/scripts/lib/core.mjs';
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
  writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, afk: { toolingRepository: 'https://github.com/acme/skills.git' } }));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  writeFileSync(join(f.repo, 'body.md'), 'Run evidence');
  f.env.TEST_CALLS = join(f.root, 'calls.log');
  return f;
}
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

test('afk rejects an afk.maxRunMinutes that is not a positive whole number', t => {
  for (const maxRunMinutes of [0, 1.5, '30']) {
    const f = fixture(t);
    writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, afk: { maxRunMinutes } }));
    assert.equal(f.linkedGit('add', configPath).status, 0);
    commitFixture(f);
    const result = f.cliRun('afk', 'runs');
    assert.equal(result.status, 2, `${JSON.stringify(maxRunMinutes)}: ${result.stderr}`);
    assert.match(result.stderr, /Configure afk\.maxRunMinutes as a positive integer/);
  }
});

test('afk check reads the on-disk spent ledger and serves a PR again once its base moves', t => {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a[0]==='pr') { out([{number:2000,title:'Fix',body:'No linked issue.',headRefOid:'abc',labels:[],isDraft:false,mergeable:'MERGEABLE',statusCheckRollup:[],reviews:[{author:{login:'reviewer'},state:'CHANGES_REQUESTED',commit:{oid:'abc'},body:''}],closingIssuesReferences:[]}]); process.exit(0); }\nif(a[0]==='issue') { out([]); process.exit(0); }\nif(a.includes('rate_limit')) { console.log('5000 2000000000'); process.exit(0); }\nif(a.includes('graphql')) { out({data:{repository:{issues:{pageInfo:{hasNextPage:false},nodes:[]}}}}); process.exit(0); }\nif(a.some(x=>x.includes('/files'))) { out([[{filename:'src/a.js'}]]); process.exit(0); }\nif(a.some(x=>x.includes('/comments'))) { out([[]]); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('{}');\n`);
  chmodSync(gh, 0o755);
  writeFileSync(join(f.repo, configPath), json({ ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] } }));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  const base = f.linkedGit('rev-parse', 'refs/remotes/origin/HEAD').stdout.trim();
  writeFileSync(join(common, 'afk-spent.json'), JSON.stringify({ 2000: `abc:1:green:mergeable:${base}:` }));
  const spent = f.cliRun('afk', 'check');
  assert.equal(spent.status, 3, `${spent.stdout}\n${spent.stderr}`);
  assert.match(spent.stdout, /Unchanged: #2000 since its last run/);
  assert.doesNotMatch(spent.stdout, /Next:/);
  writeFileSync(join(common, 'afk-spent.json'), JSON.stringify({ 2000: 'abc:1:green:mergeable:oldbase:' }));
  const moved = f.cliRun('afk', 'check');
  assert.doesNotMatch(moved.stdout, /Unchanged:/, moved.stderr);
  assert.match(moved.stdout, /Next: Review: PR #2000 \(Fix\) needs its review fixed/);
});

test('a usage error on a locked command reports only the usage message', t => {
  const f = fixture(t);
  const result = f.cliRun('issue', 'edit', '--number', '304', '--body-file', 'F', '--milestone', '12.0.0');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected --number --body-file/);
  assert.doesNotMatch(result.stderr, /lock/);
});
