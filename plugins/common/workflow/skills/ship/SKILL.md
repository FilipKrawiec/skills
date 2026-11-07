---
name: ship
description: Use when a reviewed draft PR is ready to hand to team review, or when a change has merged, to check actual base HEAD CI, respond to attributable failures and distinguish merged, deployed and accepted evidence.
allowed-tools: Skill Read Edit Bash
---

# Ship

AFK branch names use the provider-neutral `afk/<issue>-<slug>` form. This phase grants no production promotion or fix-forward authority. Report board transitions to the orchestrator; `spec` owns transition semantics.

Branch on the PR's state, first match wins:

- an open draft whose newest `agent-review` verdict at its head is `verdict=ready`: hand it off (step 1), then stop;
- a merged PR or a base check: steps 2 to 4.

## 1. Hand off to team review

Run `gh pr checks <N> --watch`; hand off only a green head. Then, in order:

1. Rewrite the description as delivered: problem, change, each criterion with its evidence, decisions, risks, manual test results. Keep the PR's issue link keyword (`Closes` or `Part of`) and any attribution lines as they are.
2. Recheck the risk label against the final diff; raise it if the diff grew, never lower it.
3. Run `gh pr ready <N>`, which invites human review; move its issue's card to Review (a `Part of` issue too: it stays there until deployed acceptance) and remove the issue's execution label.
4. Request review from every active repository user: collaborators with write access who committed, reviewed or commented in the last 90 days, except workflow identities.
5. Invoke `vcs` to turn on squash auto-merge bound to the head; it applies the protection, owner-hold and `release` gates first.
6. Comment the decisions taken and their reasons on the issue, one line each.

The unattended run ends here; team-mode review and `pr-fix` serve the PR from now on.

**Exit gate:** ready PR with reviewers requested and auto-merge on, or the red check named.

## 2. Check actual base

Fetch the base and identify actual `origin/<base>` HEAD. Check each required workflow's latest applicable run for that exact head. Success is green; failure is red; missing, incomplete or cancelled is pending. A failed run with no executable job steps is infrastructure evidence, not success. Never substitute an older green commit. Investigate the affected merge and issue by default; scan the queue or recent issues only for a scheduled sweep.

For a red workflow, find newest green G and oldest red R after it. Attribute R only when `git log --first-parent <G>..<R>` lists exactly R; otherwise report the ambiguous range or unknown cause. A failure is AFK only when its PR head uses the `afk/` branch prefix.

**Exit gate:** actual HEAD and required-check state, with culprit evidence or pending reason.

## 3. Recover within authority

For an attributable AFK failure without an open `afk/revert-<short-sha>` PR, prepare a revert from actual base HEAD, verify it and return it for authorized VCS delivery. Never merge without applicable authority. Reopen the issue, retain its lane, remove stale execution labels and record failing checks, revert, wait and retry recommendation.

For ambiguous or non-AFK failures, report evidence and the responsible actor; do not invent fix-forward authority. Report production failure to `release` immediately. Source reverts and deployment rollbacks are separate decisions.

**Exit gate:** verified revert ready for delivery, or assigned recovery and retry condition.

## 4. Record delivery

Run `node <this-skill-directory>/../../scripts/workflow.mjs worktree tidy` to remove the merged PR's worktree and any others left behind. For affected issues, prove the closing merge is an ancestor of actual HEAD. Report merge, CI, deployment and acceptance separately; missing evidence stays pending. Record `## Shipped #M` only when the exact artifact/configuration containing closing PR #M is deployed and accepted, with HEAD and run links; then remove execution labels. Never close an epic here; the AFK run served for that epic closes it once its slices reach test. A product milestone remains in Review until deployed acceptance.

**Exit gate:** affected issues' states and evidence recorded, or pending evidence named.

## Output

At most 5 lines: **Summary:** HEAD, checks, culprit/revert and delivery evidence. **Decision:** next action/actor or reserved options and recommendation. Include commands/exits in run reports (at most 8 lines).
