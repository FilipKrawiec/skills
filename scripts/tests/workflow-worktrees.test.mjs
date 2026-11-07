import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseWorktreeList,
  prStates,
  removeWorktree,
  worktreeFacts,
  worktreeVerdict,
} from '../../plugins/common/workflow/scripts/lib/worktrees.mjs';

const now = Date.UTC(2026, 10, 7);
const day = 86_400_000;
const idle = { path: '/r/.claude/worktrees/x', branch: 'x', touched: now - 3 * day };
const verdict = facts => worktreeVerdict({ ...idle, ...facts }, { now, idleDays: 2 });

test('worktree tidy keeps the main checkout, this checkout, the watcher, a busy tree and an open PR\'s tree', () => {
  assert.equal(verdict({ main: true, pr: 'MERGED' }).why, 'main checkout');
  assert.equal(verdict({ current: true, pr: 'MERGED' }).why, 'this checkout');
  assert.equal(verdict({ watcher: true, inBase: true }).why, 'AFK watcher');
  assert.equal(verdict({ busy: true, pr: 'MERGED' }).why, 'a process works in it');
  assert.deepEqual(verdict({ pr: 'OPEN', dirty: true }), { action: 'keep', why: 'its PR is open' });
});

test('worktree tidy removes a tree whose PR ended, whose head is in the base, or that is clean and pushed, with its branch', () => {
  assert.deepEqual(verdict({ pr: 'MERGED', dirty: true, touched: now }), { action: 'remove', why: 'its PR is merged', deleteBranch: true });
  assert.equal(verdict({ pr: 'CLOSED', touched: now }).why, 'its PR is closed');
  assert.equal(verdict({ inBase: true, touched: now }).why, 'its head is in the base');
  assert.equal(verdict({ pushed: true, touched: now }).why, 'clean and pushed');
  assert.equal(verdict({ pushed: true, dirty: true, touched: now }).action, 'keep');
});

test('worktree tidy removes an idle tree but keeps its branch, and keeps recent unpushed work', () => {
  assert.deepEqual(verdict({ dirty: true }), { action: 'remove', why: 'idle for 2+ days', deleteBranch: false });
  assert.deepEqual(verdict({ dirty: true, touched: now - day }), { action: 'keep', why: 'recent unpushed work' });
});

test('worktree tidy reads the porcelain list and the newest PR per branch', () => {
  const listed = 'worktree /r\nHEAD a\nbranch refs/heads/main\n\nworktree /r/w\nHEAD b\ndetached\nlocked claude\n\n';
  assert.deepEqual(parseWorktreeList(listed), [{ path: '/r', branch: 'main', locked: false }, { path: '/r/w', branch: null, locked: true }]);
  assert.equal(prStates([{ headRefName: 'x', state: 'OPEN' }, { headRefName: 'x', state: 'MERGED' }]).get('x'), 'OPEN');
});

test('worktree tidy backs up a removed tree\'s uncommitted changes, deletes an ended branch and keeps an idle one', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-tidy-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(git(root, 'init', '-q', '-b', 'main', repo).status, 0);
  assert.equal(git(repo, 'commit', '-q', '--allow-empty', '-m', 'base').status, 0);
  assert.equal(git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD').status, 0);
  const add = name => { const path = join(repo, '.claude', 'worktrees', name); assert.equal(git(repo, 'worktree', 'add', '-q', '--lock', '-b', name, path, 'origin/main').status, 0); return path; };
  const context = { root: repo, current: repo, baseRef: 'refs/remotes/origin/main', prs: new Map([['merged', 'MERGED']]), busy: [] };

  const merged = add('merged');
  assert.equal(git(merged, 'commit', '-q', '--allow-empty', '-m', 'squashed on GitHub').status, 0);
  writeFileSync(join(merged, 'left.txt'), 'leftover');
  const mergedFacts = worktreeFacts(parseWorktreeList(git(repo, 'worktree', 'list', '--porcelain').stdout)[1], context);
  assert.equal(mergedFacts.dirty, true);
  const result = removeWorktree(mergedFacts, worktreeVerdict(mergedFacts, { now: Date.now(), idleDays: 2 }), repo);
  assert.equal(result.removed, true);
  assert.equal(existsSync(merged), false);
  assert.equal(git(repo, 'rev-parse', '--verify', '-q', 'refs/heads/merged').status, 1);
  assert.equal(git(repo, 'show', `${result.backup}:left.txt`).stdout, 'leftover');

  const unpushed = add('unpushed');
  assert.equal(git(unpushed, 'commit', '-q', '--allow-empty', '-m', 'local only').status, 0);
  const facts = worktreeFacts(parseWorktreeList(git(repo, 'worktree', 'list', '--porcelain').stdout)[1], context);
  assert.equal(worktreeVerdict(facts, { now: Date.now(), idleDays: 2 }).action, 'keep');
  const stale = worktreeVerdict(facts, { now: Date.now() + 3 * day, idleDays: 2 });
  assert.equal(removeWorktree(facts, stale, repo).removed, true);
  assert.equal(git(repo, 'log', '-1', '--format=%s', 'refs/heads/unpushed').stdout.trim(), 'local only');
});
