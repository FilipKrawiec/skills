import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { cleanEnvironment, config } from './core.mjs';

const day = 86_400_000;

// Decides one linked worktree's fate from the facts read about it; first match wins.
// A removed tree's uncommitted changes are backed up first, so only a live, open or recent tree is kept.
export function worktreeVerdict(tree, { now, idleDays }) {
  if (tree.main) return { action: 'keep', why: 'main checkout' };
  if (tree.current) return { action: 'keep', why: 'this checkout' };
  if (tree.watcher) return { action: 'keep', why: 'AFK watcher' };
  if (tree.busy) return { action: 'keep', why: 'a process works in it' };
  if (tree.pr === 'OPEN') return { action: 'keep', why: 'its PR is open' };
  if (tree.pr === 'MERGED' || tree.pr === 'CLOSED') return { action: 'remove', why: `its PR is ${tree.pr.toLowerCase()}`, deleteBranch: true };
  if (tree.inBase) return { action: 'remove', why: 'its head is in the base', deleteBranch: true };
  if (tree.pushed && !tree.dirty) return { action: 'remove', why: 'clean and pushed', deleteBranch: true };
  // An idle tree's commits stay on its branch, so only its branch is kept.
  if (now - tree.touched >= idleDays * day) return { action: 'remove', why: `idle for ${idleDays}+ days`, deleteBranch: false };
  return { action: 'keep', why: 'recent unpushed work' };
}

export function parseWorktreeList(text) {
  return text.split('\n\n').map(block => block.trim()).filter(Boolean).map(block => {
    const lines = block.split('\n');
    const path = lines.find(line => line.startsWith('worktree '))?.slice(9);
    const branch = lines.find(line => line.startsWith('branch refs/heads/'))?.slice(18) || null;
    return { path, branch, locked: lines.some(line => line.startsWith('locked')) };
  }).filter(tree => tree.path);
}

// The newest PR per head branch wins, since gh lists the newest first.
export function prStates(pulls) {
  const states = new Map();
  for (const pull of pulls) if (!states.has(pull.headRefName)) states.set(pull.headRefName, pull.state);
  return states;
}

function gitIn(cwd, args, extraEnv = {}) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...cleanEnvironment(), ...extraEnv } });
}

function busyPaths() {
  const listed = spawnSync('lsof', ['-a', '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
  return listed.error ? null : listed.stdout.split('\n').filter(line => line.startsWith('n')).map(line => line.slice(1));
}

function touched(path) {
  const gitDir = gitIn(path, ['rev-parse', '--absolute-git-dir']).stdout.trim();
  const stamps = ['index', 'HEAD', 'logs/HEAD'].map(name => join(gitDir, name)).filter(existsSync).map(file => statSync(file).mtimeMs);
  return stamps.length ? Math.max(...stamps) : 0;
}

// Reads what the verdict needs; a fact that cannot be read keeps the tree.
export function worktreeFacts(tree, { root, current, baseRef, prs, busy }) {
  const status = gitIn(tree.path, ['status', '--porcelain', '--untracked-files=all']);
  const unpushed = gitIn(tree.path, ['log', '--oneline', 'HEAD', '--not', '--remotes']);
  const hasHead = gitIn(tree.path, ['rev-parse', '--verify', '-q', 'HEAD']).status === 0;
  return {
    ...tree,
    main: tree.path === root,
    current: tree.path === current,
    watcher: tree.path === join(root, '.worktrees', 'afk-watch'),
    busy: busy === null || status.status !== 0 || busy.some(path => path === tree.path || path.startsWith(`${tree.path}/`)),
    pr: tree.branch ? prs.get(tree.branch) ?? null : null,
    dirty: status.stdout.trim() !== '',
    hasHead,
    pushed: hasHead && unpushed.status === 0 && unpushed.stdout.trim() === '',
    inBase: hasHead && Boolean(baseRef) && gitIn(tree.path, ['merge-base', '--is-ancestor', 'HEAD', baseRef]).status === 0,
    touched: touched(tree.path),
  };
}

// Saves every uncommitted change, untracked files included, as a commit on the tree's HEAD under refs/backup/worktrees/.
export function backupWorktree(tree, root, now = new Date()) {
  const index = join(tmpdir(), `worktree-backup-${process.pid}-${basename(tree.path)}`);
  const ownIndex = gitIn(tree.path, ['rev-parse', '--git-path', 'index']).stdout.trim();
  const indexPath = ownIndex.startsWith('/') ? ownIndex : join(tree.path, ownIndex);
  try {
    if (existsSync(indexPath)) copyFileSync(indexPath, index);
    const withIndex = { GIT_INDEX_FILE: index };
    if (gitIn(tree.path, ['add', '-A'], withIndex).status !== 0) return null;
    const written = gitIn(tree.path, ['write-tree'], withIndex);
    if (written.status !== 0) return null;
    const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
    const message = `backup: uncommitted changes of worktree ${basename(tree.path)} (${tree.branch || 'detached'})`;
    const identity = { GIT_AUTHOR_NAME: 'workflow', GIT_AUTHOR_EMAIL: 'workflow@localhost', GIT_COMMITTER_NAME: 'workflow', GIT_COMMITTER_EMAIL: 'workflow@localhost' };
    const commit = gitIn(tree.path, ['commit-tree', written.stdout.trim(), ...(tree.hasHead ? ['-p', 'HEAD'] : []), '-m', message], identity);
    if (commit.status !== 0) return null;
    const ref = `refs/backup/worktrees/${basename(tree.path)}-${stamp}`;
    return gitIn(root, ['update-ref', ref, commit.stdout.trim()]).status === 0 ? ref : null;
  } finally { rmSync(index, { force: true }); }
}

export function removeWorktree(tree, verdict, root) {
  const backup = tree.dirty ? backupWorktree(tree, root) : null;
  if (tree.dirty && !backup) return { removed: false, note: 'backup failed' };
  gitIn(root, ['worktree', 'unlock', tree.path]);
  if (gitIn(root, ['worktree', 'remove', '--force', '--force', tree.path]).status !== 0) return { removed: false, note: 'git refused', backup };
  if (verdict.deleteBranch && tree.branch) gitIn(root, ['branch', '-D', tree.branch]);
  return { removed: true, backup };
}

export function worktreeCommand(args) {
  const usage = 'Usage: worktree tidy [--dry-run] [--idle-days N]';
  if (args[0] !== 'tidy') throw new Error(usage);
  const dryRun = args.includes('--dry-run');
  const idleAt = args.indexOf('--idle-days');
  const idleDays = idleAt === -1 ? 2 : Number(args[idleAt + 1]);
  if (!Number.isFinite(idleDays) || idleDays < 0) throw new Error(usage);
  const { root: current, baseRef } = config(false);
  const listed = gitIn(current, ['worktree', 'list', '--porcelain']);
  if (listed.status !== 0) throw new Error('git worktree list failed');
  const trees = parseWorktreeList(listed.stdout);
  const root = trees[0].path;
  const pulls = spawnSync('gh', ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'headRefName,state'], { cwd: current, encoding: 'utf8' });
  // Without PR states an open PR's tree could look idle, so nothing but clean, pushed or merged trees go.
  const prs = pulls.status === 0 ? prStates(JSON.parse(pulls.stdout)) : null;
  const busy = busyPaths();
  const now = Date.now();
  for (const tree of trees) {
    const facts = worktreeFacts(tree, { root, current, baseRef, prs: prs ?? new Map(), busy });
    let verdict = worktreeVerdict(facts, { now, idleDays });
    if (!prs && verdict.why.startsWith('idle')) verdict = { action: 'keep', why: 'PR states unavailable' };
    if (verdict.action === 'keep') { console.log(`kept ${tree.path} (${verdict.why})`); continue; }
    if (dryRun) { console.log(`would remove ${tree.path} (${verdict.why}${facts.dirty ? '; backs up its changes' : ''})`); continue; }
    const result = removeWorktree(facts, verdict, root);
    console.log(`${result.removed ? 'removed' : 'kept'} ${tree.path} (${result.removed ? verdict.why : result.note}${result.backup ? `; changes in ${result.backup}` : ''})`);
  }
  if (!dryRun) gitIn(root, ['worktree', 'prune']);
}
