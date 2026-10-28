---
name: vcs
description: Use when starting work on an issue, committing, branching, rebasing, pushing, opening a PR or getting a PR ready to merge.
allowed-tools: Bash(git:*,gh:*,lsof:*) Read
---

# Version Control

Read base and branchPrefix from `.github/lanes.json` (defaults `main`, `agent/afk-`). Preserve the main checkout (first `git worktree list` entry): never edit, switch or stash it. Use an isolated worktree; wait if another holds the branch. The orchestrator owns phase advancement; return this assignment's result before another phase. `spec` owns issue transition semantics; apply execution labels below.

## 1. Start

Fetch `origin/<base>` and reconcile existing branch/PR/assignment before creating anything. Reuse this issue's unmerged branch/worktree; never overwrite another assignment. Branch from `origin/<base>` otherwise. Wait for a dependent parent to merge; no stacked drafts. Other ready, disjoint PRs do not prevent independent work; unresolved overlapping work does.

Use unattended `<branchPrefix><N>-<slug>`, attended `<category>/<N>-<slug>`, or `<category>/<description>` without an issue. Re-read state labels; stop on another assignment. Add `state:claimed` unattended or `state:started` attended, recording actor, branch, scope and authority. Card to In progress. Labels are records, not atomic locks; serialize if coordination is unproven.

**Exit gate:** isolated assigned branch and execution record, or explicit dependency/assignment wait.

## 2. Commit and push

Stage only assigned paths. Use Conventional Commits per verified slice. Pass the project's verify gate once for changed code before push; retain commands/exits for that revision. Push HTTPS as the existing authorized implementer identity; never silently use the owner's SSH identity or provision credentials.

Before PR creation, rebase on fetched base if needed. After opening, merge base instead: rewriting history detaches review threads. Before any push to an open PR, disable auto-merge, invalidate prior review evidence and return the changed head for fresh review. Never force-push protected/default branches without explicit owner authority.

**Exit gate/output:** commit SHA and push exit 0, or exact capability wait; report commands/exits.

## 3. Open a ready PR

Require both fresh `review` axes, blocking findings verified, for the exact base/head before opening; the orchestrator supplies Reviewer results. Fix blockers; suggestions are optional. Local verdicts never replace the `agent-review` gate. Right after opening, the orchestrator assigns `agent-review`; workers never dispatch.

Open ready, never draft; reuse an existing PR. Use the issue title and its `## Plan` link. Use `Closes #<N>` only when the bounded outcome completes on merge; for a product milestone awaiting test delivery, demo or production acceptance, use `Part of #<N>` and keep the issue open. After acceptance, the orchestrator closes it through `spec`. For partial epic work use `Part of #<N>`. A revert uses `Reverts #<M>`, never `Closes` on the reverted issue.

Use this envelope, with before/after captures for visible behavior and blockers/owner choices visible. Omit inapplicable sections; add **Revert** only when a squash revert falls short (migration, data, flag, published release).

```markdown
## Executive summary
A duplicate reservation now fails before saving.

**Scope:** service and tests; API unchanged.
**Risks:** concurrency remains separate.
**Revert:** squash revert, then drop the `reservations_unique` index.
**Decision:** Reviewer records GitHub approval; agents reconcile merge.

Closes #42
Plan: https://github.com/example/project/issues/42#issuecomment-123

<details>
<summary>Review and verification</summary>

A/B: APPROVED at <base/head>; evidence <links>.
Checks: `just verify` exit 0. GitHub approval still pending.

</details>
```

Require effective branch protection for the configured Reviewer and required checks before enabling auto-merge. Resolve any additional owner hold first. Request `gh pr merge <pr> --squash --auto --match-head-commit <head>` when the base and head are final; native protection still blocks merge until Reviewer approval and checks pass. Never use exact-head approvals as a substitute for missing enforcement. The flag checks the head at invocation; it does not freeze later pushes. Remove execution labels and report desired board status to the orchestrator (sole board writer). Return PR/head to the orchestrator for `agent-review`.

**Exit gate:** ready PR, auto-merge awaiting required review/checks, or explicit protection gap.

## 4. Reconcile merge readiness

Run after every push, base change or returned review. Read actual head/checks, conflicts, threads and review state. Return repairs to Craftsman and review/verified corrections to Reviewer through the orchestrator. Never dismiss blocking reviews or resolve human threads.

Enable or keep auto-merge only under effective Reviewer protection with owner holds resolved; pending approval and checks may remain. A changed head or review-relevant base invalidates evidence: disable auto-merge, obtain fresh exact-head review, then re-enable with the head guard. Pending checks/reviews retain next actor and retry condition. An auto-merge request is not a merge; confirm it.

**Exit gate:** merged exact reviewed change, or named remaining action/actor.

## 5. Tidy

Remove only this assignment's completed clean worktrees/branches when `lsof -a -d cwd +D <worktree>` exits 1. Preserve unrelated sessions.

**Exit gate:** safe owned cleanup complete or deferred with reason.

## Authority and output

Reviewer approval authorizes eligible routine merges. Owner rules add reserved approval; production requires separate exact-candidate approval under `release`. Never change settings, secrets, variables or releases from VCS. Configured automatic test delivery belongs to delivery, not a request for production permission.

<=5 lines: **Summary:** PR/head, checks and evidence. **Decision:** next action and actor, reserved options/recommendation. Use “Nothing needed” only when the assignment has no pending action.
