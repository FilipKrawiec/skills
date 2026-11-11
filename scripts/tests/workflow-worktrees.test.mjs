import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseWorktreeList,
  prStates,
  removeWorktree,
  worktreeCommand,
  worktreeFacts,
  worktreeVerdict,
} from '../../plugins/common/workflow/scripts/lib/worktrees.mjs';

const now = Date.UTC(2026, 10, 7);
const day = 86_400_000;
const hour = 3_600_000;
const aged = now - 2 * hour;
const cli = fileURLToPath(new URL('../../plugins/common/workflow/scripts/workflow.mjs', import.meta.url));
const idle = { path: '/r/.claude/worktrees/x', branch: 'x', touched: now - 3 * day };
const verdict = facts => worktreeVerdict({ ...idle, ...facts }, { now, idleDays: 2 });

test('worktree tidy keeps the main checkout, this checkout, a busy or live tree and an open PR\'s tree', () => {
  assert.equal(verdict({ main: true, pr: 'MERGED' }).why, 'main checkout');
  assert.equal(verdict({ current: true, pr: 'MERGED' }).why, 'this checkout');
  assert.equal(verdict({ busy: true, pr: 'MERGED' }).why, 'a process works in it');
  assert.equal(verdict({ live: true, pr: 'MERGED' }).why, 'a live session holds it');
  assert.deepEqual(verdict({ pr: 'OPEN', dirty: true }), { action: 'keep', why: 'its PR is open' });
});

test('worktree tidy removes a tree whose PR ended, whose clean head is in the base, or that is clean and pushed, with its branch', () => {
  assert.deepEqual(verdict({ pr: 'MERGED', dirty: true, touched: aged }), { action: 'remove', why: 'its PR is merged', deleteBranch: true });
  assert.equal(verdict({ pr: 'CLOSED', touched: aged }).why, 'its PR is closed');
  assert.equal(verdict({ inBase: true, touched: aged }).why, 'its head is in the base');
  assert.equal(verdict({ inBase: true, dirty: true, touched: aged }).action, 'keep');
  assert.equal(verdict({ inBase: true, dirty: true }).why, 'idle for 2+ days');
  assert.equal(verdict({ pushed: true, touched: aged }).why, 'clean and pushed');
  assert.equal(verdict({ pushed: true, dirty: true, touched: aged }).action, 'keep');
  for (const facts of [{ inBase: true }, { pushed: true }, { pr: 'MERGED' }, { pr: 'CLOSED' }]) {
    assert.deepEqual(verdict({ ...facts, touched: now }), { action: 'keep', why: 'recent unpushed work' });
  }
});

test('worktree tidy removes an idle tree but keeps its branch, and keeps recent unpushed work', () => {
  assert.deepEqual(verdict({ dirty: true }), { action: 'remove', why: 'idle for 2+ days', deleteBranch: false });
  assert.deepEqual(verdict({ dirty: true, touched: now - day }), { action: 'keep', why: 'recent unpushed work' });
});

test('worktree tidy reads the porcelain list and the newest PR per branch', () => {
  const listed = 'worktree /r\nHEAD a\nbranch refs/heads/main\n\nworktree /r/w\nHEAD b\ndetached\nlocked claude session x (pid 4242)\n\n';
  assert.deepEqual(parseWorktreeList(listed), [{ path: '/r', branch: 'main', locked: false, lockPid: null }, { path: '/r/w', branch: null, locked: true, lockPid: 4242 }]);
  assert.equal(prStates([{ headRefName: 'x', state: 'OPEN' }, { headRefName: 'x', state: 'MERGED' }]).get('x'), 'OPEN');
});

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-tidy-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(git(root, 'init', '-q', '-b', 'main', repo).status, 0);
  mkdirSync(join(repo, '.github'));
  writeFileSync(join(repo, '.github', 'CODEOWNERS'), '* @reviewer\n/.github/ @example\n');
  assert.equal(git(repo, 'add', '.').status, 0);
  assert.equal(git(repo, 'commit', '-q', '-m', 'base').status, 0);
  assert.equal(git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD').status, 0);
  assert.equal(git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main').status, 0);
  const treePath = name => join(repo, '.claude', 'worktrees', name);
  const add = (name, reason = 'claude') => { assert.equal(git(repo, 'worktree', 'add', '-q', '--lock', '--reason', reason, '-b', name, treePath(name), 'origin/main').status, 0); return treePath(name); };
  const addDetached = name => { assert.equal(git(repo, 'worktree', 'add', '-q', '--lock', '--detach', treePath(name), 'origin/main').status, 0); return treePath(name); };
  const context = { root: repo, current: repo, baseRef: 'refs/remotes/origin/main', prs: new Map([['merged', 'MERGED']]), busy: [] };
  const factsOf = path => worktreeFacts(parseWorktreeList(git(repo, 'worktree', 'list', '--porcelain').stdout).find(tree => tree.path === path), context);
  const tidy = facts => removeWorktree(facts, worktreeVerdict(facts, { now: Date.now() + 2 * hour, idleDays: 2 }), repo, context.baseRef);
  return { repo, git, add, addDetached, factsOf, tidy, context };
}

test('help and unknown flags never remove a removable worktree', t => {
  const { repo, git, add } = fixture(t);
  const tree = add('removable');
  const gitDir = git(tree, 'rev-parse', '--absolute-git-dir').stdout.trim();
  const old = new Date(Date.now() - 2 * hour);
  for (const name of ['index', 'HEAD', 'logs/HEAD']) if (existsSync(join(gitDir, name))) utimesSync(join(gitDir, name), old, old);
  for (const flag of ['--help', '-h', '--unknown']) {
    const result = spawnSync(process.execPath, [cli, 'worktree', 'tidy', flag], { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, flag === '--unknown' ? 1 : 0, result.stderr);
    assert.match(result.stdout + result.stderr, /Usage:.*worktree tidy/);
    assert.equal(existsSync(tree), true);
  }
  const duplicate = spawnSync(process.execPath, [cli, 'worktree', 'tidy', '--idle-days', '0', '--idle-days', '--unknown'], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /Usage:.*worktree tidy/);
  assert.equal(existsSync(tree), true);
  for (const command of ['push', 'commit', 'status', 'drive', 'release', 'project', 'issue', 'pr', 'check', 'safety', 'manifests', 'cache', 'labels', 'next', 'wait', 'nits', 'scratch', 'review-context', 'review-post']) {
    for (const flag of ['--help', '-h']) {
      const result = spawnSync(process.execPath, [cli, command, flag], { cwd: repo, encoding: 'utf8' });
      assert.equal(result.status, 0, `${command} ${flag}: ${result.stderr}`);
      assert.match(result.stdout, /Usage:/);
      assert.equal(existsSync(tree), true);
    }
  }
});

test('worktree tidy deletes the ended branch of a clean tree and backs up a dirty tree\'s changes', t => {
  const { repo, git, add, factsOf, tidy } = fixture(t);
  const clean = add('merged');
  assert.equal(tidy(factsOf(clean)).removed, true);
  assert.equal(existsSync(clean), false);
  assert.equal(git(repo, 'rev-parse', '--verify', '-q', 'refs/heads/merged').status, 1);

  const dirty = add('merged');
  writeFileSync(join(dirty, 'left.txt'), 'leftover');
  const facts = factsOf(dirty);
  assert.equal(facts.dirty, true);
  const result = tidy(facts);
  assert.equal(result.removed, true);
  assert.equal(git(repo, 'show', `${result.backup}:left.txt`).stdout, 'leftover');
});

test('worktree tidy keeps the branch of a merged-PR tree holding a commit no remote has', t => {
  const { repo, git, add, factsOf, tidy } = fixture(t);
  const merged = add('merged');
  assert.equal(git(merged, 'commit', '-q', '--allow-empty', '-m', 'squashed on GitHub').status, 0);
  const result = tidy(factsOf(merged));
  assert.equal(result.removed, true);
  assert.equal(existsSync(merged), false);
  assert.equal(git(repo, 'log', '-1', '--format=%s', 'refs/heads/merged').stdout.trim(), 'squashed on GitHub');
  assert.match(result.note, /branch kept/);
});

test('worktree tidy keeps an idle tree\'s branch and backs up an unpushed detached HEAD', t => {
  const { repo, git, add, addDetached, factsOf, context } = fixture(t);
  const unpushed = add('unpushed');
  assert.equal(git(unpushed, 'commit', '-q', '--allow-empty', '-m', 'local only').status, 0);
  const facts = factsOf(unpushed);
  assert.equal(worktreeVerdict(facts, { now: Date.now(), idleDays: 2 }).action, 'keep');
  const stale = worktreeVerdict(facts, { now: Date.now() + 3 * day, idleDays: 2 });
  assert.equal(removeWorktree(facts, stale, repo, context.baseRef).removed, true);
  assert.equal(git(repo, 'log', '-1', '--format=%s', 'refs/heads/unpushed').stdout.trim(), 'local only');

  const detached = addDetached('loose');
  assert.equal(git(detached, 'commit', '-q', '--allow-empty', '-m', 'detached work').status, 0);
  const head = git(detached, 'rev-parse', 'HEAD').stdout.trim();
  const result = removeWorktree(factsOf(detached), { action: 'remove', why: 'idle', deleteBranch: false }, repo, context.baseRef);
  assert.equal(result.removed, true);
  assert.equal(git(repo, 'rev-parse', result.backup).stdout.trim(), head);
});

test('worktree tidy keeps a tree whose lock names a live pid and treats a dead pid\'s lock as stale', t => {
  const { add, factsOf } = fixture(t);
  const gone = spawnSync(process.execPath, ['-e', '']).pid;
  assert.equal(factsOf(add('alive', `claude session abc (pid ${process.pid})`)).live, true);
  assert.equal(factsOf(add('dead', `claude session abc (pid ${gone})`)).live, false);
});

test('worktree tidy command rejects a bad --idle-days and keeps idle trees without gh', t => {
  const { repo, git, add } = fixture(t);
  const bin = join(repo, '..', 'bin');
  mkdirSync(bin);
  for (const tool of ['git', 'lsof']) {
    const found = spawnSync('which', [tool], { encoding: 'utf8' }).stdout.trim();
    if (found) symlinkSync(found, join(bin, tool));
  }
  assert.equal(git(repo, 'remote', 'add', 'origin', 'https://github.com/example/repo.git').status, 0);
  const idleTree = add('idle');
  assert.equal(git(idleTree, 'commit', '-q', '--allow-empty', '-m', 'x').status, 0);
  const cwd = process.cwd(), path = process.env.PATH, log = console.log, lines = [];
  try {
    process.chdir(repo);
    process.env.PATH = bin;
    console.log = line => lines.push(line);
    assert.throws(() => worktreeCommand(['tidy', '--idle-days', 'soon']), /Usage/);
    assert.throws(() => worktreeCommand(['tidy', '--idle-days', '-1']), /Usage/);
    worktreeCommand(['tidy', '--dry-run', '--idle-days', '0']);
  } finally { console.log = log; process.env.PATH = path; process.chdir(cwd); }
  assert.ok(lines.some(line => line.includes(idleTree) && line.includes('PR states unavailable')), lines.join('\n'));
});

test('worktree tidy command without gh keeps a clean pushed tree but still removes one already in the base', t => {
  const { repo, git, add } = fixture(t);
  const bin = join(repo, '..', 'bin');
  mkdirSync(bin);
  for (const tool of ['git', 'lsof']) {
    const found = spawnSync('which', [tool], { encoding: 'utf8' }).stdout.trim();
    if (found) symlinkSync(found, join(bin, tool));
  }
  assert.equal(git(repo, 'remote', 'add', 'origin', 'https://github.com/example/repo.git').status, 0);
  const pushed = add('pushed');
  assert.equal(git(pushed, 'commit', '-q', '--allow-empty', '-m', 'on the remote').status, 0);
  assert.equal(git(repo, 'update-ref', 'refs/remotes/origin/pushed', 'pushed').status, 0);
  const inBase = add('ended');
  const old = new Date(Date.now() - 2 * hour);
  for (const tree of [pushed, inBase]) {
    const gitDir = git(tree, 'rev-parse', '--absolute-git-dir').stdout.trim();
    for (const name of ['index', 'HEAD', 'logs/HEAD']) if (existsSync(join(gitDir, name))) utimesSync(join(gitDir, name), old, old);
  }
  const cwd = process.cwd(), path = process.env.PATH, log = console.log, lines = [];
  try {
    process.chdir(repo);
    process.env.PATH = bin;
    console.log = line => lines.push(line);
    worktreeCommand(['tidy']);
  } finally { console.log = log; process.env.PATH = path; process.chdir(cwd); }
  assert.ok(lines.some(line => line.startsWith('kept') && line.includes(pushed) && line.includes('PR states unavailable')), lines.join('\n'));
  assert.equal(existsSync(pushed), true);
  assert.ok(lines.some(line => line.startsWith('removed') && line.includes(inBase)), lines.join('\n'));
  assert.equal(existsSync(inBase), false);
});

test('worktree facts compare real paths, so a symlinked checkout or process directory still counts', t => {
  const { repo, add, factsOf, context } = fixture(t);
  const tree = add('linked');
  const link = join(repo, '..', 'link');
  symlinkSync(tree, link);
  mkdirSync(join(tree, 'src'));
  context.current = link;
  context.busy = [join(link, 'src')];
  const facts = factsOf(tree);
  assert.equal(facts.current, true);
  assert.equal(facts.busy, true);
});
