import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, nativeRemote } from './support/workflow-cli-fixture.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { acquireReviewRef, releaseReviewRef, createReviewClaim, readReviewClaim, recoverableReviewClaim, fetchReviewRef } from '../../plugins/common/workflow/scripts/lib/review-ref.mjs';

test('only one claimant wins and a stale release cannot delete its successor', t => {
  const root = mkdtempSync(join(tmpdir(), 'review-ref-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init', '--bare', 'remote.git'); git('init', 'work');
  const cwd = join(root, 'work');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' };
  const object = message => { const r = spawnSync('git', ['commit-tree', '4b825dc642cb6eb9a060e54bf8d69288fbee4904', '-m', message], { cwd, env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const first = object('first'); const second = object('second'); const remote = join(root, 'remote.git');
  assert.equal(fetchReviewRef(cwd, remote, 5), null);
  assert.equal(acquireReviewRef(cwd, remote, 5, first), true);
  assert.equal(fetchReviewRef(cwd, remote, 5), first);
  assert.equal(acquireReviewRef(cwd, remote, 5, second), false);
  assert.equal(releaseReviewRef(cwd, remote, 5, second), false);
  assert.equal(releaseReviewRef(cwd, remote, 5, first), true);
  assert.equal(acquireReviewRef(cwd, remote, 5, second), true);
  assert.equal(releaseReviewRef(cwd, remote, 5, first), false);
  assert.equal(releaseReviewRef(cwd, remote, 5, second), true);
});

test('claim commits carry a unique identity and the reviewed head', t => {
  const root = mkdtempSync(join(tmpdir(), 'review-record-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' } }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init');
  const head = git('commit-tree', '4b825dc642cb6eb9a060e54bf8d69288fbee4904', '-m', 'head');
  const first = createReviewClaim(root, head, { nonce: 'first', pid: 123, host: 'machine', startedAt: 1 });
  const second = createReviewClaim(root, head, { nonce: 'second', pid: 124, host: 'machine', startedAt: 2 });
  assert.notEqual(first, second);
  const inherited = process.env.GIT_DIR; process.env.GIT_DIR = join(root, 'wrong');
  try { assert.deepEqual(readReviewClaim(root, first), { head, nonce: 'first', pid: 123, host: 'machine', startedAt: 1 }); }
  finally { if (inherited === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = inherited; }
});

test('recovery requires matching local identity and a dead child', () => {
  const claim = { head: 'head', nonce: 'nonce', pid: 42, host: 'host', startedAt: 123 };
  const local = { ...claim, oid: 'oid' };
  assert.equal(recoverableReviewClaim(claim, local, 'oid', 'head', 'host', () => true), true);
  assert.equal(recoverableReviewClaim(claim, local, 'oid', 'head', 'host', () => false), false);
  assert.equal(recoverableReviewClaim(claim, local, 'oid', 'head', 'elsewhere', () => true), false);
  assert.equal(recoverableReviewClaim(claim, { ...local, nonce: 'different' }, 'oid', 'head', 'host', () => true), false);
  assert.equal(recoverableReviewClaim(claim, local, 'new-oid', 'head', 'host', () => true), false);
});

test('simultaneous ref acquisitions have one winner', async t => {
  const root = mkdtempSync(join(tmpdir(), 'review-race-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const setup = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  setup('init', '--bare', 'remote.git'); setup('init', 'work');
  const cwd = join(root, 'work');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' };
  const make = message => spawnSync('git', ['commit-tree', '4b825dc642cb6eb9a060e54bf8d69288fbee4904', '-m', message], { cwd, env, encoding: 'utf8' }).stdout.trim();
  const first = make('first'); const second = make('second'); const remote = join(root, 'remote.git');
  const module = new URL('../../plugins/common/workflow/scripts/lib/review-ref.mjs', import.meta.url).href;
  const run = oid => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import { acquireReviewRef } from ${JSON.stringify(module)}; process.exit(acquireReviewRef(process.argv[1], process.argv[2], 5, process.argv[3]) ? 0 : 1)`, cwd, remote, oid]);
    child.on('error', reject); child.on('exit', resolve);
  });
  assert.deepEqual((await Promise.all([run(first), run(second)])).sort(), [0, 1]);
});

test('reviewer session respects a live child and recovers it after exit', async t => {
  const f = fixture(t); const remote = nativeRemote(f); f.env.TEST_REVIEW_REMOTE = remote;
  const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  f.env.PR_VIEW = JSON.stringify({ headRefOid: head, labels: [] });
  const session = fileURLToPath(new URL('../../plugins/common/workflow/scripts/review-session.mjs', import.meta.url));
  const start = code => spawn(process.execPath, [session, '5', head, process.execPath, '-e', code], { cwd: f.repo, env: f.env, stdio: 'pipe' });
  const wait = child => new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  const first = start('setTimeout(() => {}, 30000)');
  t.after(() => first.kill());
  let record;
  for (let i = 0; i < 100 && !record; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const names = existsSync(join(f.repo, '.wf')) ? readdirSync(join(f.repo, '.wf')).filter(name => name.startsWith('review-session-')) : [];
    for (const name of names) { try { const value = JSON.parse(readFileSync(join(f.repo, '.wf', name), 'utf8')); if (value.acquired) record = value; } catch {} }
  }
  assert.ok(record, 'first reviewer acquired the claim');
  const second = start(''); assert.equal(await wait(second), 1, 'a live reviewer retains its claim');
  process.kill(record.pid, 'SIGTERM'); assert.notEqual(await wait(first), 0);
  const third = start(''); assert.equal(await wait(third), 0, 'a new reviewer recovers the dead session');
});

test('an unverified legacy label or changed head prevents a reviewer session', t => {
  const f = fixture(t); const remote = nativeRemote(f); f.env.TEST_REVIEW_REMOTE = remote;
  const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const session = fileURLToPath(new URL('../../plugins/common/workflow/scripts/review-session.mjs', import.meta.url));
  for (const view of [{ headRefOid: head, labels: [{ name: 'state:reviewing' }] }, { headRefOid: 'a'.repeat(40), labels: [] }]) {
    f.env.PR_VIEW = JSON.stringify(view);
    const result = spawnSync(process.execPath, [session, '5', head, process.execPath, '-e', 'setTimeout(() => {}, 10000)'], { cwd: f.repo, env: f.env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(fetchReviewRef(f.repo, remote, 5), null);
  }
});


test('missing reviewer head stops with a fetch diagnostic before starting the reviewer', t => {
  const f = fixture(t); const remote = nativeRemote(f); f.env.TEST_REVIEW_REMOTE = remote;
  const head = 'a'.repeat(40);
  f.env.PR_VIEW = JSON.stringify({ headRefOid: head, labels: [] });
  const session = fileURLToPath(new URL('../../plugins/common/workflow/scripts/review-session.mjs', import.meta.url));
  const marker = join(f.repo, 'reviewer-started');
  const result = spawnSync(process.execPath, [session, '5', head, process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '')`], { cwd: f.repo, env: f.env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fetch.*5/i);
  assert.equal(existsSync(marker), false);
});

// The epic-outcome Reviewer has no PR claim; the wrapper prints its visible result and records one usage row on the epic.
function epicSession(t, script) {
  const f = fixture(t);
  const log = join(f.root, 'usage-writes.log');
  const shim = join(f.root, 'shim'); mkdirSync(shim);
  const real = join(f.root, 'bin', 'gh');
  writeFileSync(join(shim, 'gh'), `#!${process.execPath}
const fs = require('node:fs'); const args = process.argv.slice(2);
if (args[0] === 'api' && args.some(arg => /issues\\/9\\/comments/.test(arg))) {
  if (args.includes('--slurp')) process.stdout.write('[[]]');
  else fs.appendFileSync(${JSON.stringify(log)}, args.join(' ') + '\\n');
} else { const r = require('node:child_process').spawnSync(${JSON.stringify(real)}, args, { stdio: 'inherit' }); process.exit(r.status ?? 1); }
`, { mode: 0o755 });
  f.env.PATH = `${shim}:${f.env.PATH}`;
  const session = fileURLToPath(new URL('../../plugins/common/workflow/scripts/review-session.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [session, '--epic', '9', process.execPath, '-e', script, '--', '--output-format', 'json', '--model', 'opus'], { cwd: f.repo, env: f.env, encoding: 'utf8' });
  return { result, written: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}
const epicRow = written => JSON.parse(/<!-- workflow:usage (\{.*?\}) -->/s.exec(written)[1]).entries;

test('the epic-outcome session records its tokens and cost on the epic and prints its result unchanged', t => {
  const out = JSON.stringify({ type: 'result', result: 'epic 9: 2 met', total_cost_usd: 0.4, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30 } });
  const { result, written } = epicSession(t, `process.stdout.write(${JSON.stringify(out)})`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'epic 9: 2 met\n');
  const [entry] = epicRow(written);
  assert.deepEqual([entry.role, entry.host, entry.model, entry.input, entry.output, entry.cacheRead, entry.cost], ['reviewer', 'claude', 'opus', 10, 20, 30, 0.4]);
});

test('an epic-outcome session without usage data or with unparseable output records unreported and never fails', t => {
  for (const script of ['process.stdout.write("")', 'process.stdout.write("not json at all")']) {
    const { result, written } = epicSession(t, script);
    assert.equal(result.status, 0, result.stderr);
    const [entry] = epicRow(written);
    assert.deepEqual([entry.input, entry.output, entry.cost], [null, null, null]);
    assert.equal(entry.model, 'opus');
  }
});
