import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afkCheckQuiet, afkToolingVersion } from '../../plugins/common/workflow/scripts/workflow.mjs';
import { configPath, json, config, run, runCliAsync, fixture, commitFixture, changeConfig, pushRecord, nativeRemote, hookPath, assertNoPush } from './support/workflow-cli-fixture.mjs';

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

test('push refuses a PR another live AFK run holds, and lets the holder push', t => {
  const f = fixture(t);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-holder': [{ number: 4, paths: null, oneShot: true, watcherPid: process.pid }] }));
  f.env.OPEN_PRS = JSON.stringify([{ number: 4, headRefName: 'feature/test', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: [] }]);
  f.env.HOLD_COMMENTS = JSON.stringify([{ id: 1, body: '<!-- afk-issue-hold session=afk-holder -->' }]);
  const refused = f.cliRun('push');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /AFK run afk-holder holds #4/);
  assertNoPush(f);
  f.env.HOLD_COMMENTS = JSON.stringify([{ id: 1, body: '<!-- afk-issue-hold session=afk-finished -->' }]);
  const stale = f.cliRun('push');
  assert.equal(stale.status, 0, stale.stderr);
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

test('push requires configured Reviewer even when CODEOWNERS names one', t => {
  const f = fixture(t);
  writeFileSync(join(f.main, configPath), json({ version: 1, identities: { implementer: 'builder' } }));
  assert.equal(f.git('add', configPath).status, 0);
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = f.git('rev-parse', 'HEAD').stdout.trim();
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /identities\.implementer and identities\.reviewer/);
  assertNoPush(f);
});

test('push rejects a malformed configured Reviewer clearly', t => {
  const f = fixture(t);
  writeFileSync(join(f.main, configPath), json({ version: 1, identities: { implementer: 'builder', reviewer: 42 } }));
  assert.equal(f.git('add', configPath).status, 0);
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = f.git('rev-parse', 'HEAD').stdout.trim();
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /identities\.reviewer must be a GitHub login/);
  assertNoPush(f);
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

test('a tooling update ends the quiet check window', () => {
  const version = afkToolingVersion(), now = 1_000_000;
  assert.equal(version, JSON.parse(readFileSync(new URL('../../plugins/common/workflow/plugin.json', import.meta.url), 'utf8')).version);
  assert.equal(afkCheckQuiet({ signal: 's', at: now, version }, 's', version, now), true);
  assert.equal(afkCheckQuiet({ signal: 's', at: now, version: '0.0.1' }, 's', version, now), false);
  assert.equal(afkCheckQuiet({ signal: 's', at: now }, 's', version, now), false);
  assert.equal(afkCheckQuiet({ signal: 'other', at: now, version }, 's', version, now), false);
  assert.equal(afkCheckQuiet({ signal: 's', at: now - 1_800_000, version }, 's', version, now), false);
});

test('an in-place tooling update keeps the version the running code loaded', async t => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-version-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fileURLToPath(new URL('../../plugins/common/workflow/scripts', import.meta.url)), join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'plugin.json'), JSON.stringify({ version: '1.0.0' }));
  const copy = await import(new URL(`file://${join(root, 'scripts', 'workflow.mjs')}`));
  writeFileSync(join(root, 'plugin.json'), JSON.stringify({ version: '2.0.0' }));
  assert.equal(copy.afkToolingVersion(), '1.0.0');
});
