---
name: vcs
description: Use when starting work on an issue, committing, branching, rebasing, pushing, opening a PR or getting a PR ready to merge.
allowed-tools: Skill Read Bash(git:*,gh:*,node:*,lsof:*)
---

# Version Control

Follow the repository's branch, scope, verification and review rules. Preserve the main checkout and unrelated work. Work in an isolated worktree, created with the agent harness's native worktree tool where it has one; reuse the assignment's branch when suitable. Read `.agents/config.json` for implementer and Reviewer identities; derive repository/base from `origin` and Owner from base CODEOWNERS; get board settings from `workflow.mjs cache show`. AFK branches use the provider-neutral form `afk/<issue>-<slug>`; attended branches use `<issue>-<slug>`. `spec` defines transitions; only the designated actor applies each one.

## 1. Start

Fetch the base and reconcile existing work, claims and dependencies. Never overwrite another assignment or stack on an unmerged dependency. Record the assigned scope and execution state. Use the CLI's `afk/<issue>-<slug>` prefix for unattended work or an appropriate issue-prefixed branch for attended work.

**Exit gate:** isolated assignment, or a specific dependency or claim wait.

## 2. Commit and push

Run `node <this-skill-directory>/../../scripts/workflow.mjs commit --message "<conventional message>" -- <assigned paths>`; the command checks for a linked worktree and refuses existing staged changes to protect them. Run the repository's required pre-push checks for this revision; hosted CI remains a separate merge gate. Before pushing an open PR, disable auto-merge. After opening, merge base instead of rebasing, to preserve review threads: `git merge --no-ff --no-commit <base>`, resolve any conflicts, then record it with `node <this-skill-directory>/../../scripts/workflow.mjs commit --message "chore: merge <base>" -- <resolved paths>`, omitting `-- <resolved paths>` when nothing conflicted; AFK scope covers only content that differs from both parents. Never force-push a protected/default branch without explicit owner authority.

Run `node <this-skill-directory>/../../scripts/workflow.mjs push`; follow its result. Use `push --owner-bootstrap` only for an owner-directed first-config branch. When an AFK run holds a PR whose branch is checked out in another worktree, push from your differently named branch with `push --to <PR head ref>`; it refuses any ref but that of the held PR, of the PR closing the held issue, or of a PR closing one of its direct sub-issues. If Reviewer previously pushed the branch, inspect the effective rules and merge decision; an empty commit may not restore eligibility.

**Exit gate:** pushed head and check evidence, or a specific wait.

## 3. PR and readiness

Use `review` for both axes under repository and owner rules; only `agent-review` posts the binding decision. Fix confirmed blockers. Reuse existing evidence for unchanged trees or review the affected delta, and keep GitHub approval bound to the current head. Pending CI does not delay code approval; required CI remains a merge gate.

Reuse an existing PR or open one as requested. State the problem and change, scope, risks, evidence and material owner decisions; include real captures for visible changes. Link the issue and plan when applicable. Use `Closes #N` when merge completes the issue, and `Part of #N` only for an outcome awaiting deployed acceptance. Work needing several PRs is never sliced with `Part of`: invoke `spec` to split it into sub-issues, and each PR closes one. Mark a draft ready when its required checks pass.

Run `node <this-skill-directory>/../../scripts/workflow.mjs review-context --pr <number>` for review facts; check missing information independently. Never dismiss blockers or resolve human threads. Require effective code-owner protection, required checks and resolved owner holds before enabling auto-merge. If merge triggers production publication, apply `release` and its owner-approval and native-control gates before enabling it. Bind an authorized squash auto-merge request to the reviewed head; a changed head requires renewed evidence. Confirm the merge rather than assuming the request succeeded. Production approval remains separate under `release`.

**Exit gate:** merged exact reviewed change, or PR/head and the next actor and gate.

## 4. Tidy and report

Once merged or handed off, remove this assignment's worktree when clean and pushed, through that harness tool where it created it, and its merged branches; preserve unrelated sessions and anything unpushed. Return at most 5 lines: PR/head, checks, review and merge state; next actor or reserved decision. Do not change settings, secrets or releases.

**Exit gate:** safe cleanup or a reason to defer it.
