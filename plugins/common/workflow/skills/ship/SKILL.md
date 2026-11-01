---
name: ship
description: Use when a change has merged, to check actual base HEAD CI, respond to attributable failures and distinguish merged, deployed and accepted evidence.
allowed-tools: Read Edit Bash
---

# Ship

Read the base and branch prefix from `.github/lanes.json` (defaults `main`, `agent/afk-`). This phase grants no production promotion or fix-forward authority. Report board transitions to the orchestrator; `spec` owns transition semantics.

## 1. Check actual base

Fetch the base and identify actual `origin/<base>` HEAD. Check each required workflow's latest applicable run for that exact head. Success is green; failure is red; missing, incomplete or cancelled is pending. A failed run with no executable job steps is infrastructure evidence, not success. Never substitute an older green commit. Investigate the affected merge and issue by default; scan the queue or recent issues only for a scheduled sweep.

For a red workflow, find newest green G and oldest red R after it. Attribute R only when `git log --first-parent <G>..<R>` lists exactly R; otherwise report the ambiguous range or unknown cause. A failure is AFK only when its PR head uses the configured branch prefix.

**Exit gate:** actual HEAD and required-check state, with culprit evidence or pending reason.

## 2. Recover within authority

For an attributable AFK failure without an open `<branchPrefix>revert-<short-sha>` PR, prepare a revert from actual base HEAD, verify it and return it for authorized VCS delivery. Never merge without applicable authority. Reopen the issue, retain its lane, remove stale execution labels and record failing checks, revert, wait and retry recommendation.

For ambiguous or non-AFK failures, report evidence and the responsible actor; do not invent fix-forward authority. Report production failure to `release` immediately. Source reverts and deployment rollbacks are separate decisions.

**Exit gate:** verified revert ready for delivery, or assigned recovery and retry condition.

## 3. Record delivery

For affected issues, prove the closing merge is an ancestor of actual HEAD. Report merge, CI, deployment and acceptance separately; missing evidence stays pending. Record `## Shipped #M` only when the exact artifact/configuration containing closing PR #M is deployed and accepted, with HEAD and run links; then remove execution labels. Close an epic only when every sub-issue has matching shipped evidence. A product milestone remains in Review until deployed acceptance.

**Exit gate:** affected issues' states and evidence recorded, or pending evidence named.

## Output

At most 5 lines: **Summary:** HEAD, checks, culprit/revert and delivery evidence. **Decision:** next action/actor or reserved options and recommendation. Include commands/exits in run reports (at most 8 lines).
