import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, realpathSync, rmSync, statfsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { cleanEnvironment, config } from './core.mjs';

const day = 86_400_000;
// A tree younger than this is never removed for being ended, in the base or pushed: another session may have just made it.
const graceMs = 3_600_000;

// Decides one linked worktree's fate from the facts read about it; first match wins.
// A removed tree's uncommitted changes are backed up first, so only a live, open or recent tree is kept.
export function worktreeVerdict(tree, { now, idleDays }) {
  if (tree.main) return { action: 'keep', why: 'main checkout' };
  if (tree.current) return { action: 'keep', why: 'this checkout' };
  if (tree.busy) return { action: 'keep', why: 'a process works in it' };
  if (tree.live) return { action: 'keep', why: 'a live session holds it' };
  if (tree.pr === 'OPEN') return { action: 'keep', why: 'its PR is open' };
  const settled = now - tree.touched >= graceMs;
  if (settled && (tree.pr === 'MERGED' || tree.pr === 'CLOSED')) return { action: 'remove', why: `its PR is ${tree.pr.toLowerCase()}`, deleteBranch: true };
  if (settled && tree.inBase && !tree.dirty) return { action: 'remove', why: 'its head is in the base', deleteBranch: true };
  if (settled && tree.pushed && !tree.dirty) return { action: 'remove', why: 'clean and pushed', deleteBranch: true };
  // An idle tree keeps its branch; a detached one gets a backup ref of its HEAD when removed.
  if (now - tree.touched >= idleDays * day) return { action: 'remove', why: `idle for ${idleDays}+ days`, deleteBranch: false };
  return { action: 'keep', why: 'recent unpushed work' };
}

export function parseWorktreeList(text) {
  return text.split('\n\n').map(block => block.trim()).filter(Boolean).map(block => {
    const lines = block.split('\n');
    const path = lines.find(line => line.startsWith('worktree '))?.slice(9);
    const branch = lines.find(line => line.startsWith('branch refs/heads/'))?.slice(18) || null;
    const lock = lines.find(line => line === 'locked' || line.startsWith('locked '));
    return { path, branch, locked: Boolean(lock), lockPid: Number(/\(pid (\d+)\)/.exec(lock || '')?.[1]) || null };
  }).filter(tree => tree.path);
}

// The newest PR per head branch wins, since gh lists the newest first.
export function prStates(pulls) {
  const states = new Map();
  for (const pull of pulls) if (!states.has(pull.headRefName)) states.set(pull.headRefName, pull.state);
  return states;
}

const real = path => { try { return realpathSync(path); } catch { return path; } };

function gitIn(cwd, args, extraEnv = {}) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...cleanEnvironment(), GIT_OPTIONAL_LOCKS: '0', ...extraEnv } });
}

// The desktop app's Apple Virtualization VM mounts the whole repository, so its process holds every tree's path without working in one.
const vmProcess = /^com\.apple\.Virtualization/;

// Directories real processes hold, from `lsof -Fpcn` output; a virtualization VM's own directory never counts as busy.
export function busyFromLsof(text) {
  const paths = [];
  let command = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) command = '';
    else if (line.startsWith('c')) command = line.slice(1);
    else if (line.startsWith('n') && !vmProcess.test(command)) paths.push(line.slice(1));
  }
  return paths;
}

export function busyPaths() {
  const listed = spawnSync('lsof', ['+c', '0', '-a', '-d', 'cwd', '-Fpcn'], { encoding: 'utf8' });
  return listed.error ? null : busyFromLsof(listed.stdout);
}

// Below this much free disk, drive starts no new parallel worktree.
export const diskFloorBytes = 50 * 1024 ** 3;
export function freeDiskBytes(path) {
  try { const stats = statfsSync(path); return stats.bavail * stats.bsize; } catch { return null; }
}
export const diskFloorLine = free => `drive: ${(free / 1024 ** 3).toFixed(1)} GB free is under the ${diskFloorBytes / 1024 ** 3} GB floor; no new worktree starts until space frees`;

function touched(path) {
  const gitDir = gitIn(path, ['rev-parse', '--absolute-git-dir']).stdout.trim();
  const stamps = ['index', 'HEAD', 'logs/HEAD'].map(name => join(gitDir, name)).filter(existsSync).map(file => statSync(file).mtimeMs);
  return stamps.length ? Math.max(...stamps) : 0;
}

// A tree is live while its lock names a running pid; a dead pid's lock is stale.
function liveSession(tree) {
  const pidAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
  return Boolean(tree.lockPid && pidAlive(tree.lockPid));
}

// Reads what the verdict needs; a fact that cannot be read keeps the tree.
export function worktreeFacts(tree, { root, current, baseRef, prs, busy }) {
  const treePath = real(tree.path);
  const status = gitIn(tree.path, ['status', '--porcelain', '--untracked-files=all']);
  const unpushed = gitIn(tree.path, ['log', '--oneline', 'HEAD', '--not', '--remotes']);
  const hasHead = gitIn(tree.path, ['rev-parse', '--verify', '-q', 'HEAD']).status === 0;
  return {
    ...tree,
    main: treePath === real(root),
    current: treePath === real(current),
    live: liveSession(tree),
    busy: busy === null || status.status !== 0 || busy.map(real).some(path => path === treePath || path.startsWith(`${treePath}/`)),
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
    return saveRef(root, tree, commit.stdout.trim(), stamp);
  } finally { rmSync(index, { force: true }); }
}

// Creates refs/backup/worktrees/<name>-<stamp>-<short hash>; the empty old value makes the update create-only, so no backup is overwritten.
function saveRef(root, tree, sha, stamp) {
  const ref = `refs/backup/worktrees/${basename(tree.path)}-${stamp}-${sha.slice(0, 7)}`;
  return gitIn(root, ['update-ref', ref, sha, '']).status === 0 ? ref : null;
}

// A branch goes only when its head is on a remote or in the base; otherwise it stays and the note says so.
export function removeWorktree(tree, verdict, root, baseRef) {
  let backup = tree.dirty ? backupWorktree(tree, root) : null;
  if (tree.dirty && !backup) return { removed: false, note: 'backup failed' };
  if (!tree.branch && !tree.dirty && tree.hasHead && !tree.pushed && !tree.inBase) {
    backup = saveRef(root, tree, gitIn(tree.path, ['rev-parse', 'HEAD']).stdout.trim(), new Date().toISOString().replace(/[-:]/g, '').slice(0, 15));
    if (!backup) return { removed: false, note: 'backup failed' };
  }
  gitIn(root, ['worktree', 'unlock', tree.path]);
  if (gitIn(root, ['worktree', 'remove', '--force', '--force', tree.path]).status !== 0) return { removed: false, note: 'git refused', backup };
  if (!verdict.deleteBranch || !tree.branch) return { removed: true, backup };
  const unsaved = gitIn(root, ['rev-list', '-1', `refs/heads/${tree.branch}`, '--not', '--remotes', ...(baseRef ? [baseRef] : [])]);
  if (unsaved.status !== 0 || unsaved.stdout.trim() !== '') return { removed: true, backup, note: `branch kept: ${tree.branch} holds commits no remote has` };
  gitIn(root, ['branch', '-D', tree.branch]);
  return { removed: true, backup };
}

// Removes the trees `worktreeVerdict` removes; `settledOnly` limits that to ended PRs and heads already in the base, as `drive` and the runner do every call.
// A tree whose directory is gone is pruned from git's list (its branch kept) unless a live session holds its lock; it is not counted in the trees removed.
export function tidyWorktrees({ dryRun = false, idleDays = 2, settledOnly = false, log = console.log, busy = busyPaths() } = {}) {
  const { root: current, baseRef } = config(false);
  const listed = gitIn(current, ['worktree', 'list', '--porcelain']);
  if (listed.status !== 0) throw new Error('git worktree list failed');
  const trees = parseWorktreeList(listed.stdout);
  const root = trees[0].path;
  const pulls = spawnSync('gh', ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'headRefName,state'], { cwd: current, encoding: 'utf8' });
  // Without PR states an open PR's tree could look idle, so only a tree already in the base goes.
  const prs = pulls.status === 0 ? prStates(JSON.parse(pulls.stdout)) : null;
  const now = Date.now();
  const removed = [];
  const gone = [];
  for (const tree of trees) {
    // A tree deleted outside git (its parent's removal took it) has nothing to back up: unlock its record for prune, keep its branch.
    // A live session's lock stays: its directory may be on a volume that is only unmounted.
    if (!existsSync(tree.path)) {
      if (liveSession(tree)) { log(`kept ${tree.path} (its directory is missing but a live session holds its lock)`); continue; }
      if (dryRun) { log(`would prune ${tree.path} (its directory is gone; branch kept)`); continue; }
      if (tree.locked && gitIn(root, ['worktree', 'unlock', tree.path]).status !== 0) { log(`kept ${tree.path} (its directory is gone but unlocking its record failed)`); continue; }
      gone.push(tree.path);
      continue;
    }
    const facts = worktreeFacts(tree, { root, current, baseRef, prs: prs ?? new Map(), busy });
    let verdict = worktreeVerdict(facts, { now, idleDays });
    if (!prs && verdict.action === 'remove' && verdict.why !== 'its head is in the base') verdict = { action: 'keep', why: 'PR states unavailable' };
    if (settledOnly && verdict.action === 'remove' && !settledReason.test(verdict.why)) verdict = { action: 'keep', why: 'not settled' };
    if (verdict.action === 'keep') { log(`kept ${tree.path} (${verdict.why})`); continue; }
    if (dryRun) { log(`would remove ${tree.path} (${verdict.why}${facts.dirty ? '; backs up its changes' : ''})`); continue; }
    const result = removeWorktree(facts, verdict, root, baseRef);
    if (result.removed) removed.push(tree.path);
    log(`${result.removed ? 'removed' : 'kept'} ${tree.path} (${result.removed ? verdict.why : result.note}${result.removed && result.note ? `; ${result.note}` : ''}${result.backup ? `; changes in ${result.backup}` : ''})`);
  }
  if (!dryRun) {
    const pruned = gitIn(root, ['worktree', 'prune']).status === 0;
    for (const path of gone) log(`${pruned ? 'pruned' : 'kept'} ${path} (${pruned ? 'its directory is gone; branch kept' : 'git worktree prune failed'})`);
  }
  return removed;
}

// A tree is settled once its PR merged or closed, or its head is in the base.
const settledReason = /^(its PR is (merged|closed)|its head is in the base)$/;

export function worktreeCommand(args) {
  const usage = 'Usage: worktree tidy [--dry-run] [--idle-days N]';
  if (args[0] !== 'tidy') throw new Error(usage);
  let sawIdleDays = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--dry-run') continue;
    if (args[i] === '--idle-days' && !sawIdleDays && i + 1 < args.length) { sawIdleDays = true; i++; continue; }
    throw new Error(usage);
  }
  const dryRun = args.includes('--dry-run');
  const idleAt = args.indexOf('--idle-days');
  const idleDays = idleAt === -1 ? 2 : Number(args[idleAt + 1]);
  if (!Number.isFinite(idleDays) || idleDays < 0) throw new Error(usage);
  tidyWorktrees({ dryRun, idleDays });
}
