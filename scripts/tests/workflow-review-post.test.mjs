import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture } from './support/workflow-cli-fixture.mjs';

const sha = 'a'.repeat(40);
const thread = (id, author, body) => ({ id, isResolved: false, isOutdated: false, path: 'a.txt', line: 1, comments: { nodes: [{ url: 'u', body, author: { login: author } }] } });

function setup(t, extra = {}) {
  const f = fixture(t);
  f.env.GH_LOG = join(f.root, `gh-${Math.random().toString(36).slice(2)}.log`);
  f.env.REVIEW_RECORD = join(f.root, 'review.json');
  Object.assign(f.env, extra);
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
  assert.deepEqual(record().payload, { commit_id: sha, event: 'APPROVE', body: readFileSync(join(f.repo, 'body.md'), 'utf8'), comments: [{ path: 'a.txt', line: 3, side: 'RIGHT', body: '**Nit** rename' }] });
  assert.doesNotMatch(result.stdout + result.stderr, /SECRET_TOKEN/);
  assert.deepEqual(log(), ['post', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
});

test('review-post refuses a bad event, sha or body marker without posting, and releases the claim', t => {
  const { f, post, log } = setup(t);
  assert.notEqual(post('--event', 'MERGE').status, 0);
  assert.notEqual(f.cliRun('review-post', '--pr', '5', '--sha', 'HEAD', '--event', 'COMMENT', '--body-file', 'body.md').status, 0);
  writeFileSync(join(f.repo, 'plain.md'), 'no marker');
  assert.notEqual(f.cliRun('review-post', '--pr', '5', '--sha', sha, '--event', 'COMMENT', '--body-file', 'plain.md').status, 0);
  assert.deepEqual(log(), ['pr edit 5 --repo github.com/acme/app --remove-label state:reviewing', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing', 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing']);
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
  const { post, log } = setup(t, { FAIL_REVIEW_POST: '1' });
  const result = post('--event', 'REQUEST_CHANGES');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Blocked:/);
  assert.doesNotMatch(result.stdout + result.stderr + log().join('\n'), /SECRET_TOKEN/);
  assert.equal(log().length, 2);
  assert.match(log()[0], /post-failed sha=a{40} -->.*REQUEST_CHANGES/);
  assert.equal(log()[1], 'pr edit 5 --repo github.com/acme/app --remove-label state:reviewing');
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
  assert.equal(record().payload.comments[0].body, '**Nit** stdin');
});
