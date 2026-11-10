import { spawnSync } from 'node:child_process';
import { effectiveBranchPolicy } from '../safety.mjs';
import { afkPrRecord, afkReviewerApproved } from './afk-board.mjs';
import { jsonCommand, run } from './core.mjs';

const failedStates = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'];
const passedStates = ['SUCCESS', 'NEUTRAL', 'SKIPPED'];
const checkState = check => (check.conclusion || check.state || '').toUpperCase();
const checkName = check => check.name || check.context || '';

// Why `pr ready` may not hand the draft to team review, or null: it targets the configured base, the newest author verdict at
// its head is `ready`, every check at that head passed, the configured required checks among them, and no conflict or outside
// change request stands.
export function prReadyRefusal(pr, cfg) {
  if (pr.state !== 'OPEN') return `PR #${pr.number} is ${String(pr.state).toLowerCase()}`;
  if (!pr.isDraft) return `PR #${pr.number} is already ready for review`;
  if (pr.baseRefName !== cfg.base) return `PR #${pr.number} targets ${pr.baseRefName}, not ${cfg.base}`;
  const checks = pr.statusCheckRollup || [];
  const failed = checks.filter(check => failedStates.includes(checkState(check))).map(checkName);
  if (failed.length) return `checks failed at ${pr.headRefOid}: ${failed.join(', ')}`;
  const pending = checks.filter(check => !passedStates.includes(checkState(check))).map(checkName);
  if (pending.length) return `checks pending at ${pr.headRefOid}: ${pending.join(', ')}`;
  const missing = (cfg.requiredChecks || []).filter(name => !checks.some(check => checkName(check) === name));
  if (missing.length) return `required checks missing at ${pr.headRefOid}: ${missing.join(', ')}`;
  if (pr.mergeable === 'CONFLICTING') return `PR #${pr.number} conflicts with its base`;
  const record = afkPrRecord({ ...pr, labels: pr.labels || [] }, cfg);
  if (!record.shipReady) return `no author-mode agent-review verdict=ready at head ${pr.headRefOid}, or someone outside the workflow requests changes there`;
  return null;
}

// Why `pr auto-merge` may not turn on squash auto-merge, or null: the PR is ready, the Reviewer approved its head with
// `verdict=ready` (`verdict=owner` under `review:owner`, which also needs the owner's approval at that head), no owner change
// request stands, no check failed, it targets the configured base, and that base requires code-owner review and the configured checks.
export function prAutoMergeRefusal(pr, cfg, policy) {
  if (pr.state !== 'OPEN') return `PR #${pr.number} is ${String(pr.state).toLowerCase()}`;
  if (pr.isDraft) return `PR #${pr.number} is a draft; run pr ready first`;
  if (pr.baseRefName !== cfg.base) return `PR #${pr.number} targets ${pr.baseRefName}, not ${cfg.base}`;
  if (!policy?.reviews?.[1]) return `${cfg.base} does not visibly require code-owner review`;
  const unprotected = (cfg.requiredChecks || []).filter(name => !policy.checks.includes(name));
  if (unprotected.length) return `${cfg.base} does not require checks: ${unprotected.join(', ')}`;
  const failed = (pr.statusCheckRollup || []).filter(check => failedStates.includes(checkState(check))).map(checkName);
  if (failed.length) return `checks failed at ${pr.headRefOid}: ${failed.join(', ')}`;
  if (pr.mergeable === 'CONFLICTING') return `PR #${pr.number} conflicts with its base`;
  const ownerLane = (pr.labels || []).some(label => label.name === 'review:owner');
  if (!afkReviewerApproved({ ...pr, labels: pr.labels || [] }, cfg)) return `no Reviewer approval with agent-review verdict=${ownerLane ? 'owner' : 'ready'} at head ${pr.headRefOid}`;
  const owner = (pr.reviews || []).filter(review => review.author?.login?.toLowerCase() === cfg.owner?.toLowerCase() && review.state !== 'COMMENTED').at(-1);
  if (owner?.state === 'CHANGES_REQUESTED') return `the owner ${cfg.owner} requests changes`;
  if (ownerLane && !(owner?.state === 'APPROVED' && owner.commit?.oid === pr.headRefOid)) return `review:owner holds it until ${cfg.owner} approves head ${pr.headRefOid}`;
  return null;
}

const prFields = 'number,state,isDraft,baseRefName,headRefOid,labels,reviews,statusCheckRollup,mergeable,body,closingIssuesReferences,autoMergeRequest';
function readPr(repo, number) { return jsonCommand('gh', ['pr', 'view', number, '--repo', repo, '--json', prFields]); }
function readPolicy(repo, base) {
  const read = endpoint => { try { return jsonCommand('gh', ['api', '--hostname', 'github.com', `repos/${repo}/${endpoint}`]); } catch { return null; } };
  return effectiveBranchPolicy(read(`branches/${encodeURIComponent(base)}/protection`), read(`rules/branches/${encodeURIComponent(base)}?per_page=100`));
}

export function prCommand(args, lanes) {
  const [action, flag, number, ...rest] = args;
  if (!['ready', 'auto-merge'].includes(action) || flag !== '--pr' || !/^[1-9]\d*$/.test(number || '') || rest.length) throw new Error('Usage: pr ready|auto-merge --pr NUMBER');
  if (!lanes.reviewer || !lanes.owner) throw new Error('Configure identities.reviewer and name the owner in .github/CODEOWNERS');
  const repo = lanes.repo;
  const pr = readPr(repo, number);
  if (action === 'ready') {
    const refusal = prReadyRefusal(pr, lanes);
    if (refusal) throw new Error(`pr ready refused: ${refusal}`);
    run('gh', ['pr', 'ready', number, '--repo', repo]);
    // CODEOWNERS may auto-request the owner; team review requests the owner only on `verdict=owner`.
    try { run('gh', ['pr', 'edit', number, '--repo', repo, '--remove-reviewer', lanes.owner]); } catch { console.error(`Warning: could not drop ${lanes.owner}'s review request on #${number}; remove it by hand.`); }
    console.log(`PR #${number} ready for review at ${pr.headRefOid}`);
    return;
  }
  const refusal = prAutoMergeRefusal(pr, lanes, readPolicy(repo, lanes.base));
  if (refusal) throw new Error(`pr auto-merge refused: ${refusal}`);
  const merge = spawnSync('gh', ['pr', 'merge', number, '--repo', repo, '--squash', '--auto', '--match-head-commit', pr.headRefOid], { encoding: 'utf8' });
  const after = readPr(repo, number);
  if (after.state === 'MERGED') console.log(`PR #${number} merged at ${pr.headRefOid}`);
  else if (after.autoMergeRequest && after.headRefOid === pr.headRefOid) console.log(`PR #${number} auto-merge on at ${pr.headRefOid}`);
  else throw new Error(`GitHub did not accept auto-merge for #${number} at ${pr.headRefOid}${merge.status === 0 ? '' : ` (${(merge.stderr || '').trim().split('\n').at(-1)})`}`);
}
