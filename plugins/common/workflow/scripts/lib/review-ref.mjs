import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment } from './core.mjs';

function refFor(pr) {
  if (!/^[1-9]\d*$/.test(String(pr))) throw new Error('Invalid pull request number');
  return `refs/heads/workflow-review-claims/pr-${pr}`;
}
function update(cwd, remote, pr, expected, target, env) {
  if (expected && !/^[0-9a-f]{40,64}$/i.test(expected)) throw new Error('Invalid expected claim object');
  if (target && !/^[0-9a-f]{40,64}$/i.test(target)) throw new Error('Invalid claim object');
  const ref = refFor(pr);
  const result = spawnSync('git', ['push', '--no-follow-tags', '--recurse-submodules=no', `--force-with-lease=${ref}:${expected}`, remote, `${target}:${ref}`], { cwd, env, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result.status === 0;
}
export const acquireReviewRef = (cwd, remote, pr, oid, env) => update(cwd, remote, pr, '', oid, env);
export const releaseReviewRef = (cwd, remote, pr, oid, env) => update(cwd, remote, pr, oid, '', env);

export function createReviewClaim(cwd, head, identity) {
  if (!/^[0-9a-f]{40,64}$/i.test(head) || !identity?.nonce || !identity?.host || !Number.isSafeInteger(identity.pid) || identity.pid < 1 || !Number.isFinite(identity.startedAt)) throw new Error('Invalid reviewer claim identity');
  const env = { ...cleanEnvironment(), GIT_AUTHOR_NAME: 'Workflow claim', GIT_AUTHOR_EMAIL: 'workflow-claim@invalid', GIT_COMMITTER_NAME: 'Workflow claim', GIT_COMMITTER_EMAIL: 'workflow-claim@invalid' };
  const result = spawnSync('git', ['commit-tree', `${head}^{tree}`, '-p', head, '-m', JSON.stringify({ head, ...identity })], { cwd, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot create reviewer claim object');
  return result.stdout.trim();
}
export function readReviewClaim(cwd, oid) {
  if (!/^[0-9a-f]{40,64}$/i.test(oid)) throw new Error('Invalid claim object');
  const result = spawnSync('git', ['show', '-s', '--format=%B', oid], { cwd, env: cleanEnvironment(), encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot read reviewer claim object');
  return JSON.parse(result.stdout);
}
export function recoverableReviewClaim(claim, local, oid, head, host, dead = pid => { try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } }) {
  return Boolean(claim && local && claim.head === head && claim.host === host && local.oid === oid && claim.nonce && ['head', 'host', 'nonce', 'pid', 'startedAt'].every(key => claim[key] === local[key]) && Number.isSafeInteger(claim.pid) && claim.pid > 0 && dead(claim.pid) === true);
}

// Run claim ref traffic through an isolated repository and the configured reviewer credential.
export function withReviewTransport(root, repo, reviewer, action) {
  if (!/^[A-Za-z0-9-]+$/.test(reviewer || '') || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '')) throw new Error('Invalid claim repository or reviewer');
  const temp = mkdtempSync(join(tmpdir(), 'workflow-review-ref-'));
  const env = { ...cleanEnvironment(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: fileURLToPath(new URL('../git-askpass.mjs', import.meta.url)), WORKFLOW_IMPLEMENTER: reviewer };
  if (process.env.GIT_CONFIG_GLOBAL !== undefined) env.WORKFLOW_HOOK_CONFIG_GLOBAL = process.env.GIT_CONFIG_GLOBAL;
  if (process.env.GIT_CONFIG_NOSYSTEM !== undefined) env.WORKFLOW_HOOK_CONFIG_NOSYSTEM = process.env.GIT_CONFIG_NOSYSTEM;
  try {
    const init = spawnSync('git', ['init', '--bare', '--quiet', temp], { cwd: root, env });
    if (init.status !== 0) throw new Error('Cannot initialize claim transport');
    const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, env, encoding: 'utf8' });
    if (common.status !== 0) throw new Error('Cannot locate claim objects');
    writeFileSync(join(temp, 'objects', 'info', 'alternates'), `${join(common.stdout.trim(), 'objects')}\n`);
    const hook = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-push'], { cwd: root, env, encoding: 'utf8' });
    if (hook.status !== 0) throw new Error('Cannot locate pre-push hook');
    env.WORKFLOW_PRE_PUSH_HOOK = hook.stdout.trim(); env.WORKFLOW_PUSH_WORKTREE = root;
    const wrapper = join(temp, 'hooks', 'pre-push');
    copyFileSync(fileURLToPath(new URL('../push-hook.mjs', import.meta.url)), wrapper); chmodSync(wrapper, 0o755);
    return action(temp, `https://github.com/${repo}.git`, env);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
export function fetchReviewRef(cwd, remote, pr, env) {
  const ref = refFor(pr);
  const listing = spawnSync('git', ['ls-remote', '--refs', remote, ref], { cwd, env, encoding: 'utf8' });
  if (listing.status !== 0) throw new Error('Cannot read reviewer claim ref');
  const line = listing.stdout.trim();
  if (!line) return null;
  const [oid, found] = line.split(/\s+/);
  if (!/^[0-9a-f]{40,64}$/i.test(oid || '') || found !== ref) throw new Error('Invalid reviewer claim ref');
  const fetched = spawnSync('git', ['fetch', '--no-tags', remote, oid], { cwd, env, encoding: 'utf8' });
  if (fetched.status !== 0) throw new Error('Cannot fetch reviewer claim object');
  return oid;
}

export function sessionClaim(root, repo, reviewer, pr) {
  return withReviewTransport(root, repo, reviewer, (directory, remote, env) => {
    const oid = fetchReviewRef(directory, remote, pr, env);
    if (!oid) return null;
    const claim = readReviewClaim(directory, oid);
    if (!/^[0-9a-f-]{36}$/i.test(claim?.nonce || '')) return { oid, claim, local: null };
    let local;
    try { local = JSON.parse(readFileSync(join(root, '.wf', `review-session-${claim.nonce}.json`), 'utf8')); } catch { local = null; }
    return { oid, claim, local };
  });
}
export function releaseSessionClaim(root, repo, reviewer, pr, oid) {
  return withReviewTransport(root, repo, reviewer, (directory, remote, env) => releaseReviewRef(directory, remote, pr, oid, env));
}
export function localClaimIsDead(session, head) {
  if (!session?.local?.machine || session.local.machine !== hostname()) return false;
  return recoverableReviewClaim(session?.claim, session?.local, session?.oid, head, session.local.host, pid => {
    if (process.platform === 'win32') return false;
    try { process.kill(-pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
  });
}
export function ownedReviewSession(root, repo, reviewer, pr, head, nonce) {
  if (!/^[0-9a-f-]{36}$/i.test(nonce || '')) throw new Error('Reviewer session claim is required');
  const path = join(root, '.wf', `review-session-${nonce}.json`);
  let local;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { local = JSON.parse(readFileSync(path, 'utf8')); if (local.acquired) break; } catch { /* wrapper has not recorded its acquisition yet */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  if (!local?.acquired || local.pr !== String(pr) || local.head !== head || local.nonce !== nonce) throw new Error('Reviewer session does not own this PR head');
  const session = sessionClaim(root, repo, reviewer, pr);
  if (!session || session.oid !== local.oid || session.claim.nonce !== nonce || session.claim.head !== head || session.claim.pid !== local.pid || session.claim.host !== local.host || session.claim.startedAt !== local.startedAt) throw new Error('Reviewer claim changed or cannot be verified');
  return session;
}

// A failed post releases the claim so drive can recover, but marks the session retryable once: the same session may claim the PR again
// (the claim object is unchanged) and post again, with no new Reviewer session.
export function markRetryable(root, nonce, retry) {
  const path = join(root, '.wf', `review-session-${nonce}.json`);
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), retry }));
}
export function resumeReviewSession(root, repo, reviewer, pr, head, nonce) {
  try { return ownedReviewSession(root, repo, reviewer, pr, head, nonce); } catch (error) {
    let local;
    try { local = JSON.parse(readFileSync(join(root, '.wf', `review-session-${nonce}.json`), 'utf8')); } catch { throw error; }
    if (local?.retry !== 1 || !local.acquired || local.pr !== String(pr) || local.head !== head || local.nonce !== nonce) throw error;
    if (sessionClaim(root, repo, reviewer, pr)) throw error;
    if (!withReviewTransport(root, repo, reviewer, (directory, remote, env) => acquireReviewRef(directory, remote, pr, local.oid, env))) throw error;
    markRetryable(root, nonce, 0);
    return { ...ownedReviewSession(root, repo, reviewer, pr, head, nonce), reclaimed: true };
  }
}
