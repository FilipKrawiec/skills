---
name: ship
description: Use when a change has merged, to check actual base HEAD CI, respond to attributable failures and distinguish merged, deployed and accepted evidence.
allowed-tools: Read Edit Bash
---

# Ship

Read `<base>` and `<branchPrefix>` from `.github/lanes.json` (defaults `main`, `agent/afk-`). This procedure checks merged work; it grants no production promotion or fix-forward authority. Report desired board transitions to the orchestrator; only the orchestrator changes board status under `spec`.

## 1. Observe actual HEAD

Report Review cards whose open issue has no open PR for readiness-aware routing under `spec`. Keep a product-milestone issue in Review after its `Part of` PR merges; report Done only after deployed acceptance. Fetch the base and record the actual `origin/<base>` HEAD, even when it has no runs. Read configured required workflows and `gh run list --branch <base> --event push --limit 200`; query further when needed for that HEAD.

Judge each required workflow's latest applicable run for the actual HEAD: completed success is green, completed failure is red, missing/incomplete/cancelled is pending. A failed run with no executable job steps is infrastructure evidence, not success. Never substitute an older green commit or ignore a missing workflow. Base is red if any required check failed, otherwise pending if any evidence is missing, otherwise green.

For each red workflow, find newest green commit G and oldest red R after it. Attribute R only when `git log --first-parent <G>..<R>` lists exactly R; otherwise report an ambiguous range, or unknown without G. It is AFK only when its PR's head branch starts with `<branchPrefix>`.

**Exit gate:** actual HEAD and required-check state, with culprit evidence or pending reasons.

## 2. Respond within authority

For an attributable AFK failure without an open `<branchPrefix>revert-<short-sha>` PR, prepare an isolated revert from actual base HEAD using `git revert --no-edit <sha>`; run the project's verify gate. Return VCS delivery to the orchestrator with exact commit, branch, commands, failing evidence and merge restrictions. Never merge the revert without applicable authority. Reopen its issue, retain its lane authorization, remove stale `state:*` labels, record a technical wait/replan, and comment failing checks, revert PR and retry recommendation in ≤5 lines.

For ambiguous or non-AFK failures, report the evidence and recommended follow-up; do not invent fix-forward authority. For production failure, return exact candidate/failure evidence immediately to the orchestrator for `release` recovery under configured authority. Source reverts and deployment rollback are different actions; never infer one from the other.

**Exit gate:** verified revert ready for VCS, or assigned recovery/owner decision with actor and retry condition.

## 3. Confirm evidence separately

For recently completed issues, identify the newest merged closing PR and prove its merge commit is an ancestor of actual HEAD. Record merged/CI status separately from deployed and accepted status. Require deployment identity and acceptance evidence for that exact artifact/configuration before marking shipped; a green base or merged PR is insufficient. Missing evidence stays pending.

For issues closed within 30 days without `## Shipped #M` for closing PR #M, add that comment only with deployed-and-accepted evidence, artifact/configuration, HEAD and run links; remove `state:` labels then. Close an open `type:epic` only when all sub-issues are closed and have matching shipped evidence.

**Exit gate:** merged, CI, deployed and accepted states supported separately; pending evidence explicit.

## Output

≤5 lines: **Summary** links actual HEAD, CI, culprit/revert, deployment/acceptance and confirmed issues; include commands/exits in run reports (≤8 lines). **Decision:** next action and responsible actor, or reserved owner options/recommendation.

```text
Summary: HEAD a1b2 merged; CI pending (required run missing); deployed pending.
Evidence: git fetch exit 0; run query exit 0; no shipped issues confirmed.
Decision: Delivery steward rechecks required run and deployment acceptance.
```
