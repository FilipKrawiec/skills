---
name: ship
description: Use when a reviewed draft PR is ready to hand to team review, or when a change has merged, to check actual base HEAD CI, respond to attributable failures and distinguish merged, deployed and accepted evidence.
allowed-tools: Skill Read Edit Bash Agent
---

# Ship

AFK branch names use the provider-neutral `afk/<issue>-<slug>` form. This phase grants no production promotion or fix-forward authority. Report board transitions to the orchestrator; `spec` owns transition semantics.

Branch on the PR's state, first match wins:

- an open draft whose newest `agent-review` verdict at its head is `verdict=ready`: hand it off (step 1): mark it ready, team-review it, then request reviewers; then stop;
- a merged PR or a base check: steps 2 to 4.

## 1. Hand off to team review

Run `gh pr checks <N> --watch`; hand off only a green head. Then, in order:

1. Rewrite the description as delivered: problem, change, each criterion with its evidence, decisions, risks, manual test results. Keep the PR's issue link keyword (`Closes` or `Part of`) and any attribution lines as they are.
2. Recheck the risk label against the final diff; raise it if the diff grew, never lower it.
3. Run `gh pr ready <N>`, then drop its CODEOWNERS owner auto-request: `gh pr edit <N> --remove-reviewer <owner>`. Move its issue's card to Review (a `Part of` issue too: it stays there until deployed acceptance) and remove the issue's execution label.
4. Team review: start a fresh subagent with this brief: `Review PR #<N> (issue #<issue>) in team mode: base <SHA>, head <SHA>, last reviewed <SHA|none>. Load agent-review; post with GH_TOKEN=$(gh auth token --user <identities.reviewer from .agents/config.json>) on each gh call. Never print the token. Return verdict, round and Important findings in at most 8 lines.` Act on the returned verdict, first match wins:
   - `verdict=owner`: go to step 5 and also request the owner;
   - `verdict=ready`: go to step 5;
   - `verdict=fixes` with round below 3: invoke `pr-fix`, then repeat step 4 at the new head;
   - any other verdict at round >= 3 (the third failed round): request the owner, comment the open Important threads on the PR, skip steps 5 and 6, and stop;
   - any other verdict: report it and stop.
5. Request reviewers: request review from every active repository user (collaborators with write access who committed, reviewed or commented in the last 90 days), except workflow identities and the owner.
6. Invoke `vcs` to turn on squash auto-merge bound to the head; it applies the protection, owner-hold and `release` gates first.
7. Comment the decisions taken and their reasons on the issue, one line each.

The unattended run ends here; `pr-fix` serves the PR from now on.

**Exit gate:** ready PR with the Reviewer verdict recorded, reviewers requested and auto-merge on; or the owner requested after a third failed round; or the red check named.

## 2. Check actual base

Fetch the base and identify actual `origin/<base>` HEAD. Check each required workflow's latest applicable run for that exact head. Success is green; failure is red; missing, incomplete or cancelled is pending. A failed run with no executable job steps is infrastructure evidence, not success. Never substitute an older green commit. Investigate the affected merge and issue by default; scan the queue or recent issues only for a scheduled sweep.

For a red workflow, find newest green G and oldest red R after it. Attribute R only when `git log --first-parent <G>..<R>` lists exactly R; otherwise report the ambiguous range or unknown cause. A failure is AFK only when its PR head uses the `afk/` branch prefix.

**Exit gate:** actual HEAD and required-check state, with culprit evidence or pending reason.

## 3. Recover within authority

For an attributable AFK failure without an open `afk/revert-<short-sha>` PR, prepare a revert from actual base HEAD, verify it and return it for authorized VCS delivery. Never merge without applicable authority. Reopen the issue, retain its lane, remove stale execution labels and record failing checks, revert, wait and retry recommendation.

For ambiguous or non-AFK failures, report evidence and the responsible actor; do not invent fix-forward authority. Report production failure to `release` immediately. Source reverts and deployment rollbacks are separate decisions.

**Exit gate:** verified revert ready for delivery, or assigned recovery and retry condition.

## 4. Record delivery

When the PR has merged, invoke `vcs` to tidy worktrees. For affected issues, prove the closing merge is an ancestor of actual HEAD. Report merge, CI, deployment and acceptance separately; missing evidence stays pending. Record `## Shipped #M` only when the exact artifact/configuration containing closing PR #M is deployed and accepted, with HEAD and run links; then remove execution labels. Never close an epic here; the AFK run served for that epic closes it once its slices reach test. A product milestone remains in Review until deployed acceptance.

**Exit gate:** affected issues' states and evidence recorded, or pending evidence named.

## Output

At most 5 lines: **Summary:** HEAD, checks, culprit/revert and delivery evidence. **Decision:** next action/actor or reserved options and recommendation. Include commands/exits in run reports (at most 8 lines).
