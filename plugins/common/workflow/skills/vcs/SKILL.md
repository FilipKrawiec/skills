---
name: vcs
description: Use when starting work on an issue, committing, branching, rebasing, pushing, opening a PR or getting a PR ready to merge.
allowed-tools: Bash(git:*,gh:*,lsof:*) Read
---

# Version Control

Read base and branchPrefix from `.github/lanes.json` (defaults `main`, `agent/afk-`). Preserve the main checkout (first `git worktree list` entry): never edit, switch or stash it. Use an isolated worktree; wait if another holds the branch. The orchestrator owns phase advancement; return this assignment's result before another phase. `spec` owns issue transition semantics; apply execution labels below.

## 1. Start

Fetch `origin/<base>` and reconcile branch/PR/assignment. Reuse this issue's unmerged branch/worktree; otherwise branch from `origin/<base>`. Never overwrite another assignment or stack PRs; wait for a dependent parent to merge. Open PRs never block shared files; the later one resolves conflicts.

Use unattended `<branchPrefix><N>-<slug>`, attended `<category>/<N>-<slug>`, or `<category>/<description>` without an issue. Re-read state labels; stop on another assignment. Add `state:claimed` unattended or `state:started` attended, recording actor, branch, scope and authority. Card to In progress. Labels are records, not atomic locks; serialize if coordination is unproven.

**Exit gate:** isolated assigned branch and execution record, or explicit dependency/assignment wait.

## 2. Commit and push

Stage only assigned paths. Use Conventional Commits per verified slice. Pass the project's verify gate once for changed code before push; retain commands/exits for that revision. Push HTTPS as the existing authorized implementer identity; never silently use the owner's SSH identity or provision credentials.

Before each push, resolve the push URL's effective HTTPS Git credential and authenticate the host's read-only identity endpoint without exposing the secret. Require the authorized implementer, never Reviewer. Serialize shared credential changes through check and push or bind the checked credential to that push; otherwise stop. If Reviewer ever pushed the PR branch, later pushes, even empty commits, cannot restore that Reviewer's approval eligibility; report for owner action.

Before PR creation, rebase on fetched base if needed. After opening, merge base instead: rewriting history detaches review threads. Before any push to an open PR, disable auto-merge, invalidate prior review evidence and return the changed head for fresh review. Never force-push protected/default branches without explicit owner authority.

**Exit gate/output:** commit SHA and push exit 0, or exact capability wait; report commands/exits.

## 3. Open the PR

Require both fresh `review` axes, blocking findings verified, for the exact base/head before opening; the orchestrator supplies Reviewer results. Fix blockers; suggestions are optional. Local verdicts never replace `agent-review`. Right after opening, the orchestrator assigns `agent-review`; workers never dispatch.

Open as the host asks; ready a draft once checks pass, then tell the owner. Reuse existing PRs; use the issue title and `## Plan` link. Use `Closes #<N>` only when merge completes the outcome. Use `Part of #<N>` for partial epic work or a milestone awaiting test delivery, demo or production acceptance; after acceptance the orchestrator closes it through `spec`. A revert uses `Reverts #<M>`, never `Closes`.

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

Require effective Reviewer protection and required checks before auto-merge; resolve owner holds. When base and head are final, request `gh pr merge <pr> --squash --auto --match-head-commit <head>`. The flag checks head only at invocation; exact-head approval never substitutes for enforcement. Remove execution labels, report board status to the orchestrator (sole board writer), and return PR/head for `agent-review`.

**Exit gate:** PR, auto-merge awaiting required review/checks, or explicit protection gap.

## 4. Reconcile merge readiness

After every push, base change or review, read head/checks, conflicts, threads and review state. Return repairs and corrections through the orchestrator. Never dismiss blocking reviews or resolve human threads.

Enable or keep auto-merge only under effective Reviewer protection with owner holds resolved; pending approval and checks may remain. A changed head or review-relevant base invalidates evidence: disable auto-merge, obtain fresh exact-head review, then re-enable with the head guard. Pending checks/reviews retain next actor and retry condition. An auto-merge request is not a merge; confirm it.

**Exit gate:** merged exact reviewed change, or named remaining action/actor.

## 5. Tidy

Remove only this assignment's completed clean worktrees/branches when `lsof -a -d cwd +D <worktree>` exits 1. Preserve unrelated sessions.

**Exit gate:** safe owned cleanup complete or deferred with reason.

## Authority and output

Reviewer approval authorizes eligible routine merges. Owner rules add reserved approval; production requires separate exact-candidate approval under `release`. Never change settings, secrets, variables or releases from VCS.

<=5 lines: **Summary:** PR/head, checks and evidence. **Decision:** next action and actor, reserved options/recommendation. Use “Nothing needed” only when the assignment has no pending action.
