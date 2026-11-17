import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fixture, nativeRemote } from './support/workflow-cli-fixture.mjs';
import { findingKey } from '../../plugins/common/workflow/scripts/lib/vcs.mjs';

const sha = 'a'.repeat(40);
const thread = (id, author, body) => ({ id, isResolved: false, isOutdated: false, path: 'a.txt', line: 1, comments: { nodes: [{ url: 'u', body, author: { login: author } }] } });

function setup(t, extra = {}) {
  const f = fixture(t);
  f.env.GH_LOG = join(f.root, `gh-${Math.random().toString(36).slice(2)}.log`);
  f.env.REVIEW_RECORD = join(f.root, 'review.json');
  Object.assign(f.env, extra);
  const remote = nativeRemote(f); f.env.TEST_REVIEW_REMOTE = remote;
  const nonce = '11111111-1111-4111-8111-111111111111';
  const identity = { head: sha, nonce, pid: process.pid, host: 'fixture', startedAt: Date.now() };
  const env = { ...f.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' };
  const git = (...args) => { const result = spawnSync(f.env.REAL_GIT, args, { cwd: f.repo, env, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  const base = git('rev-parse', 'HEAD');
  const oid = git('commit-tree', `${base}^{tree}`, '-p', base, '-m', JSON.stringify(identity));
  git('push', remote, `${oid}:refs/heads/workflow-review-claims/pr-5`);
  mkdirSync(join(f.repo, '.wf'), { recursive: true });
  writeFileSync(join(f.repo, '.wf', `review-session-${nonce}.json`), JSON.stringify({ ...identity, oid, pr: '5', acquired: true }));
  f.env.WORKFLOW_REVIEW_NONCE = nonce; f.env.HEAD_SHA = sha; f.env.BASE_SHA = base;
  writeFileSync(join(f.repo, 'body.md'), `<!-- agent-review sha=${sha} verdict=ready -->\nLooks good`);
  writeFileSync(join(f.repo, 'comments.json'), JSON.stringify([{ path: 'a.txt', line: 3, body: '**Nit** rename' }]));
  const post = (...args) => f.cliRun('review-post', '--pr', '5', '--sha', sha, '--body-file', 'body.md', ...args);
  const log = () => (existsSync(f.env.GH_LOG) ? readFileSync(f.env.GH_LOG, 'utf8').split('\n').filter(Boolean) : []);
  return { f, post, log, record: () => JSON.parse(readFileSync(f.env.REVIEW_RECORD, 'utf8')) };
}

test('review-post sends one review as the reviewer, then removes the label', t => {
  const { f, post, log, record } = setup(t);
  const result = post('--event', 'APPROVE', '--comments-file', 'comments.json');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Posted review 7 on #5/);
  assert.equal(record().token, 'SECRET_TOKEN');
  assert.deepEqual(record().payload, { commit_id: sha, event: 'APPROVE', body: readFileSync(join(f.repo, 'body.md'), 'utf8'), comments: [{ path: 'a.txt', line: 3, side: 'RIGHT', body: `**Nit** rename\n\n<!-- finding-key:${findingKey({ path: 'a.txt', body: '**Nit** rename' })} -->` }] });
  assert.doesNotMatch(result.stdout + result.stderr, /SECRET_TOKEN/);
  assert.deepEqual(log(), ['post', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
});

test('review-post refuses a bad event, sha or body marker without posting, and releases the claim', t => {
  const { f, post, log } = setup(t);
  assert.notEqual(post('--event', 'MERGE').status, 0);
  assert.notEqual(f.cliRun('review-post', '--pr', '5', '--sha', 'HEAD', '--event', 'COMMENT', '--body-file', 'body.md').status, 0);
  writeFileSync(join(f.repo, 'plain.md'), 'no marker');
  assert.notEqual(f.cliRun('review-post', '--pr', '5', '--sha', sha, '--event', 'COMMENT', '--body-file', 'plain.md').status, 0);
  assert.deepEqual(log(), ['pr edit 5 --repo github.com/acme/app --remove-label state:reviewing'], 'only the first attempt owns a claim to release');
  assert.equal(existsSync(f.env.REVIEW_RECORD), false);
});

const threads = [thread('T1', 'reviewer', '**Nit** a'), thread('T2', 'reviewer', '**Pre-existing** b'), thread('T3', 'reviewer', '**Important** c'), thread('T4', 'reviewer', '**Important** d'), thread('T5', 'owner', '**Nit** human'), thread('T6', 'reviewer', '**Follow-up** c')];

test('APPROVE resolves the reviewer Nit, Pre-existing, Follow-up and flagged threads before posting', t => {
  const { post, log } = setup(t, { REVIEW_THREADS: JSON.stringify(threads) });
  const result = post('--event', 'APPROVE', '--resolve-thread', 'T4');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(log().slice(0, 5), ['resolve T1', 'resolve T2', 'resolve T4', 'resolve T6', 'post']);
  assert.equal(log().length, 6);
});

test('APPROVE then resolves the Nit and Pre-existing threads its own inline comments opened', t => {
  const created = [thread('N1', 'reviewer', '**Nit** rename'), thread('N2', 'reviewer', '**Important** kept'), thread('N3', 'owner', '**Nit** human')];
  const { post, log } = setup(t, { REVIEW_THREADS: JSON.stringify(threads), REVIEW_THREADS_AFTER: JSON.stringify(created) });
  const result = post('--event', 'APPROVE', '--comments-file', 'comments.json');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(log(), ['resolve T1', 'resolve T2', 'resolve T6', 'post', 'resolve N1', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
});

test('a failing resolve after the posted review warns, keeps exit 0 and still removes the label', t => {
  const { post, log, f } = setup(t, { REVIEW_THREADS: JSON.stringify([]), REVIEW_THREADS_AFTER: JSON.stringify([thread('N1', 'reviewer', '**Nit** x')]), FAIL_RESOLVE: '1' });
  const result = post('--event', 'APPROVE', '--comments-file', 'comments.json');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Warning: review posted, but could not resolve/);
  assert.equal(existsSync(f.env.REVIEW_RECORD), true);
  assert.deepEqual(log(), ['post', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
});

test('COMMENT resolves only flagged threads', t => {
  const { post, log } = setup(t, { REVIEW_THREADS: JSON.stringify(threads) });
  assert.equal(post('--event', 'COMMENT').status, 0);
  assert.equal(log()[0], 'post');
  const flagged = setup(t, { REVIEW_THREADS: JSON.stringify(threads) });
  assert.equal(flagged.post('--event', 'COMMENT', '--resolve-thread', 'T3').status, 0);
  assert.deepEqual(flagged.log().slice(0, 2), ['resolve T3', 'post']);
});

test('a failing resolve blocks the post, releases the claim and leaves a failure comment', t => {
  const { post, log, f } = setup(t, { REVIEW_THREADS: JSON.stringify(threads), FAIL_RESOLVE: '1' });
  const result = post('--event', 'APPROVE');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Blocked:/);
  assert.equal(existsSync(f.env.REVIEW_RECORD), false);
  assert.equal(log().length, 2);
  assert.match(log()[0], /^pr comment 5 --repo github.com\/acme\/app --body <!-- agent-review post-failed sha=a{40} -->/);
  assert.equal(log()[1], 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing');
});

test('a failed post releases the claim, comments the failure and never prints the token', t => {
  const { f, post, log } = setup(t, { FAIL_REVIEW_POST: '1' });
  const result = post('--event', 'REQUEST_CHANGES');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Blocked:/);
  assert.doesNotMatch(result.stdout + result.stderr + log().join('\n'), /SECRET_TOKEN/);
  assert.equal(log().length, 2);
  assert.match(log()[0], /post-failed sha=a{40} -->.*REQUEST_CHANGES/);
  assert.equal(log()[1], 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing');
  const ref = spawnSync(f.env.REAL_GIT, ['ls-remote', '--refs', f.env.TEST_REVIEW_REMOTE, 'refs/heads/workflow-review-claims/pr-5'], { cwd: f.repo, encoding: 'utf8' });
  assert.equal(ref.stdout.trim(), '', 'the atomic claim is released');
});

test('a failed label removal warns and still exits 0', t => {
  const { post } = setup(t, { FAIL_PR_EDIT: '1' });
  const result = post('--event', 'COMMENT');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /state:reviewing/);
});

test('review-post reads the body from stdin', t => {
  const { f, log, record } = setup(t);
  const body = `<!-- agent-review sha=${sha} verdict=ready -->\nFrom stdin`;
  const result = f.cliRun('review-post', '--pr', '5', '--sha', sha, '--event', 'COMMENT', '--body-file', '-', { input: body });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(record().payload.body, body);
  assert.deepEqual(log(), ['post', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
});

test('a body file outside the worktree is refused with the way out, and the claim is released', t => {
  const { f, log } = setup(t);
  const outside = join(f.root, 'outside.md');
  writeFileSync(outside, `<!-- agent-review sha=${sha} verdict=ready -->`);
  const result = f.cliRun('review-post', '--pr', '5', '--sha', sha, '--event', 'COMMENT', '--body-file', outside);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /under \.wf\/ \(run `scratch`\) or pass - to read stdin/);
  assert.deepEqual(log(), ['pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
});

test('scratch creates a git-ignored .wf directory inside the worktree', t => {
  const { f } = setup(t);
  const result = f.cliRun('scratch');
  assert.equal(result.status, 0, result.stderr);
  const { path } = JSON.parse(result.stdout);
  assert.equal(existsSync(path), true);
  writeFileSync(join(path, 'body.md'), 'x');
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: f.repo, encoding: 'utf8' });
  assert.doesNotMatch(status.stdout, /\.wf/);
  assert.equal(f.cliRun('scratch').status, 0);
});

test('review-context --claim labels an unclaimed PR and refuses a claimed one', t => {
  const { f, log } = setup(t);
  const claimed = f.cliRun('review-context', '--pr', '5', '--claim');
  assert.equal(claimed.status, 0, claimed.stderr);
  assert.equal(JSON.parse(claimed.stdout).claimed, true);
  assert.deepEqual(log(), ['pr edit 5 --repo github.com/acme/app --add-label state:reviewing']);
  f.env.PR_VIEW = JSON.stringify({ labels: [{ name: 'state:reviewing' }], headRefOid: sha });
  const refused = f.cliRun('review-context', '--pr', '5', '--claim');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /already claimed/);
  assert.equal(log().length, 1);
});

test('only an APPROVE with verdict=owner adds review:owner after the post', t => {
  for (const [verdict, event, expected] of [['owner', 'APPROVE', true], ['ready', 'APPROVE', false], ['cap', 'COMMENT', false], ['fixes', 'COMMENT', false]]) {
    const { f, post, log } = setup(t);
    writeFileSync(join(f.repo, 'body.md'), `<!-- agent-review sha=${sha} round=3 verdict=${verdict} -->\nVerdict`);
    const result = post('--event', event);
    assert.equal(result.status, 0, result.stderr);
    const label = 'pr edit 5 --repo github.com/acme/app --add-label review:owner';
    assert.deepEqual(log(), expected ? ['post', label, 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing'] : ['post', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing'], verdict);
  }
});

test('review-post refuses verdict=owner on anything but an APPROVE, without posting', t => {
  const { f, post, log } = setup(t);
  writeFileSync(join(f.repo, 'body.md'), `<!-- agent-review sha=${sha} round=3 verdict=owner -->\nOwner decision`);
  const result = post('--event', 'COMMENT');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verdict=owner requires --event APPROVE/);
  assert.deepEqual(log(), ['pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
  assert.equal(existsSync(f.env.REVIEW_RECORD), false);
});

test('review-context groups files by area, lists pure renames as mechanical and compares against the last reviewed head', t => {
  const { f } = setup(t);
  const previous = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(f.repo, 'changed.txt'), 'x');
  assert.equal(f.linkedGit('add', 'changed.txt').status, 0);
  assert.equal(f.linkedGit('-c', 'user.name=T', '-c', 'user.email=t@example.test', 'commit', '-qm', 'fix').status, 0);
  const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const files = [
    { path: 'src/app/a.js', additions: 5, deletions: 1, changeType: 'MODIFIED' },
    { path: 'src/app/deep/b.js', additions: 2, deletions: 0, changeType: 'ADDED' },
    { path: 'docs/x.md', additions: 1, deletions: 1, changeType: 'MODIFIED' },
    { path: 'src/lib/moved.js', additions: 0, deletions: 0, changeType: 'RENAMED' },
  ];
  const reviews = [{ author: { login: 'reviewer' }, state: 'COMMENTED', body: `<!-- agent-review sha=${previous} round=1 verdict=fixes -->`, commit: { oid: previous } }];
  f.env.PR_VIEW = JSON.stringify({ headRefOid: head, baseRefOid: previous, files, reviews, labels: [] });
  const result = f.cliRun('review-context', '--pr', '5');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.areas, [
    { area: 'src/app', additions: 7, deletions: 1, files: ['src/app/a.js', 'src/app/deep/b.js'] },
    { area: 'docs', additions: 1, deletions: 1, files: ['docs/x.md'] },
  ]);
  assert.deepEqual(output.mechanical, ['src/lib/moved.js']);
  assert.deepEqual([output.comparison.previous, output.comparison.previousFrom, output.comparison.changedFiles], [previous, 'reviewer verdict', ['changed.txt']]);
  f.env.PR_VIEW = JSON.stringify({ headRefOid: head, baseRefOid: previous, files, reviews: [{ ...reviews[0], commit: { oid: head } }], labels: [] });
  assert.equal(JSON.parse(f.cliRun('review-context', '--pr', '5').stdout).comparison, undefined, 'a verdict at the head leaves no delta');
  f.env.PR_VIEW = JSON.stringify({ headRefOid: head, baseRefOid: previous, files, reviews: [{ ...reviews[0], author: { login: 'teammate' } }], labels: [] });
  assert.equal(JSON.parse(f.cliRun('review-context', '--pr', '5').stdout).comparison, undefined, 'only the Reviewer verdict counts');
});

test('nits --done labels each named PR nits:swept and prints one JSON line', t => {
  const { f, log } = setup(t);
  const result = f.cliRun('nits', '--done', '3', '4');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { swept: [3, 4] });
  assert.deepEqual(log(), ['pr edit 3 --repo acme/app --add-label nits:swept', 'pr edit 4 --repo acme/app --add-label nits:swept']);
  assert.notEqual(f.cliRun('nits', '--days', 'many').status, 0);
});

test('review-context --claim takes no claim when a read fails', t => {
  const { f, log } = setup(t, { REVIEW_THREADS: 'not json' });
  const result = f.cliRun('review-context', '--pr', '5', '--claim');
  assert.notEqual(result.status, 0);
  assert.deepEqual(log(), []);
});

test('review-post reads inline comments from stdin', t => {
  const { f, record } = setup(t);
  const comments = JSON.stringify([{ path: 'a.txt', line: 2, body: '**Nit** stdin' }]);
  const result = f.cliRun('review-post', '--pr', '5', '--sha', sha, '--event', 'COMMENT', '--body-file', 'body.md', '--comments-file', '-', { input: comments });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(record().payload.comments[0].body, `**Nit** stdin\n\n<!-- finding-key:${findingKey({ path: 'a.txt', body: '**Nit** stdin' })} -->`);
});

test('review-post rejects an unsupported approve verdict at post time', t => {
  const { f, post } = setup(t);
  writeFileSync(join(f.repo, 'body.md'), `<!-- agent-review sha=${sha} verdict=approve -->\nLooks good`);
  const result = post('--event', 'APPROVE');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verdict=approve.*verdict=ready/);
});


test('review-post reads committed config from a nested directory', t => {
  const { f } = setup(t);
  const nested = join(f.repo, 'nested'); mkdirSync(nested);
  const result = f.cliRun('review-post', '--pr', '5', '--sha', sha, '--event', 'COMMENT', '--body-file', join(f.repo, 'body.md'), { cwd: nested });
  assert.equal(result.status, 0, result.stderr);
});

test('a failed inline review identifies the attempted location', t => {
  const { post } = setup(t, { FAIL_REVIEW_POST: '1' });
  const result = post('--event', 'COMMENT', '--comments-file', 'comments.json');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.txt:3/);
});

test('a reviewer without the session token cannot post or release another claim', t => {
  const { f, post, log } = setup(t);
  delete f.env.WORKFLOW_REVIEW_NONCE;
  const result = post('--event', 'COMMENT');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /session claim is required/);
  assert.deepEqual(log(), []);
  assert.equal(existsSync(f.env.REVIEW_RECORD), false);
});

test('a repeated post skips findings whose key an open thread already carries', t => {
  const key = findingKey({ path: 'a.txt', body: '**Nit** rename' });
  const existing = thread('K1', 'reviewer', `**Nit** rename\n\n<!-- finding-key:${key} -->`);
  const { f, post, record, log } = setup(t, { REVIEW_THREADS: JSON.stringify([existing]), PR_FILES: JSON.stringify([{ filename: 'b.txt', patch: '@@ -0,0 +1,2 @@\n+x\n+y' }]) });
  writeFileSync(join(f.repo, 'comments.json'), JSON.stringify([{ path: 'a.txt', line: 3, body: '**Nit** rename' }, { path: 'b.txt', line: 1, criterion: 'AC4', failure: 'no retry', body: '**Important** retry duplicates' }]));
  const result = post('--event', 'COMMENT', '--comments-file', 'comments.json');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped 1 finding already on #5/);
  assert.deepEqual(record().payload.comments.map(c => c.path), ['b.txt']);
  assert.match(record().payload.comments[0].body, new RegExp(`<!-- finding-key:${findingKey({ path: 'b.txt', criterion: 'AC4', failure: 'no retry', body: 'x' })} -->`));
  assert.deepEqual(log(), ['post', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
});

test('a resolved thread does not hide a finding that is raised again', t => {
  const key = findingKey({ path: 'a.txt', body: '**Nit** rename' });
  const resolved = { ...thread('K2', 'reviewer', `**Nit** rename\n\n<!-- finding-key:${key} -->`), isResolved: true };
  const { post, record } = setup(t, { REVIEW_THREADS: JSON.stringify([resolved]) });
  const result = post('--event', 'COMMENT', '--comments-file', 'comments.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(record().payload.comments.length, 1);
});

test('findingKey is stable across retries and differs by path, criterion and failure', () => {
  const base = { path: 'a.js', criterion: 'AC1', failure: 'drops data', body: '**Important** x' };
  assert.equal(findingKey(base), findingKey({ ...base, body: 'reworded' }));
  for (const change of [{ path: 'b.js' }, { criterion: 'AC2' }, { failure: 'other' }]) assert.notEqual(findingKey(base), findingKey({ ...base, ...change }));
  assert.equal(findingKey({ ...base, key: 'my-key-1' }), 'my-key-1');
});

test('an inline comment outside the diff moves into the review body and the output says so', t => {
  const { f, post, record } = setup(t);
  writeFileSync(join(f.repo, 'comments.json'), JSON.stringify([{ path: 'a.txt', line: 3, body: '**Nit** inside' }, { path: 'a.txt', line: 90, body: '**Important** outside' }, { path: 'gone.txt', line: 1, body: '**Nit** unknown file' }]));
  const result = post('--event', 'REQUEST_CHANGES', '--comments-file', 'comments.json');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Moved 2 findings outside the PR diff into the review body: a\.txt:90, gone\.txt:1/);
  const { payload } = record();
  assert.deepEqual(payload.comments.map(c => `${c.path}:${c.line}`), ['a.txt:3']);
  assert.match(payload.body, /^<!-- agent-review sha=/);
  assert.match(payload.body, /- `a\.txt:90` \*\*Important\*\* outside/);
  assert.match(payload.body, /- `gone\.txt:1` \*\*Nit\*\* unknown file/);
  assert.doesNotMatch(payload.body, /finding-key/);
});

test('the same session claims again once after a failed post and retries', t => {
  const { f, post, log, record } = setup(t, { FAIL_REVIEW_POST_ONCE: join(tmpdir(), `once-${process.pid}-${Math.random()}`) });
  t.after(() => rmSync(f.env.FAIL_REVIEW_POST_ONCE, { force: true }));
  const first = post('--event', 'COMMENT');
  assert.equal(first.status, 1);
  assert.match(first.stderr, /claim released, retry/);
  const second = post('--event', 'COMMENT');
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Reclaimed #5 .*Posted review 7/s);
  assert.equal(record().payload.event, 'COMMENT');
  assert.ok(log().includes('pr edit 5 --repo github.com/acme/app --add-label state:reviewing'));
  const ref = spawnSync(f.env.REAL_GIT, ['ls-remote', '--refs', f.env.TEST_REVIEW_REMOTE, 'refs/heads/workflow-review-claims/pr-5'], { cwd: f.repo, encoding: 'utf8' });
  assert.equal(ref.stdout.trim(), '', 'the retry releases the claim again');
});

test('a second failed post gets no further retry', t => {
  const { post } = setup(t, { FAIL_REVIEW_POST: '1' });
  assert.equal(post('--event', 'COMMENT').status, 1);
  assert.equal(post('--event', 'COMMENT').status, 1);
  const third = post('--event', 'COMMENT');
  assert.equal(third.status, 1);
  assert.match(third.stderr, /Reviewer claim changed or cannot be verified/);
});

test('a failed GitHub call names its command and GitHub error line, without the token', t => {
  const { post } = setup(t, { FAIL_REVIEW_POST: '1' });
  const result = post('--event', 'COMMENT');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub command failed \(gh api --hostname github\.com repos\/acme\/app\/pulls\/5\/reviews\): post rejected \[redacted\]/);
  assert.doesNotMatch(result.stderr, /SECRET_TOKEN/);
});
