---
name: vcs
description: Use when starting work on an issue, committing, branching, rebasing, pushing, opening a PR or getting a PR ready to merge.
allowed-tools: Skill Read Bash(git:*,gh:*,node:*,lsof:*)
---

# Version Control

Follow the repository's branch, scope, verification and review rules. Preserve the main checkout and unrelated work; work in an isolated worktree, created with the harness's native worktree tool where it has one; reuse the assignment's branch when suitable. Read `.agents/config.json` for implementer and Reviewer identities; derive repository/base from `origin` and Owner from base CODEOWNERS; get board settings from `workflow.mjs cache show`. AFK branches use the provider-neutral form `afk/<issue>-<slug>`; attended branches use `<issue>-<slug>`. `spec` defines transitions; only the designated actor applies each one.

## 1. Start

Run `node <this-skill-directory>/../../scripts/workflow.mjs worktree tidy` first. Fetch the base and reconcile existing work, claims and dependencies; never overwrite another assignment or stack on an unmerged dependency. Record the scope. Use the `afk/` prefix for unattended work, an issue-prefixed branch otherwise.

**Exit gate:** isolated assignment, or a specific dependency or claim wait.

## 2. Commit and push

Run `node <this-skill-directory>/../../scripts/workflow.mjs commit --message "<conventional message>" -- <assigned paths>`; it refuses existing staged changes. Only the first line must be a Conventional Commit. Run the repository's required pre-push checks for this revision; hosted CI stays a separate merge gate. Before pushing an open PR, disable auto-merge. After opening, merge base instead of rebasing, to preserve review threads: `git merge --no-ff --no-commit <base>`, resolve any conflicts, then record with `node <this-skill-directory>/../../scripts/workflow.mjs commit --message "chore: merge <base>" -- <resolved paths>`, omitting `-- <resolved paths>` when nothing conflicted; AFK scope covers only content differing from both parents. Never force-push a protected/default branch without owner authority.

Run `node <this-skill-directory>/../../scripts/workflow.mjs push`. Use `push --owner-bootstrap` only for an owner's first-config branch. When an AFK run holds a PR whose branch is checked out in another worktree, push from your differently named branch with `push --to <PR head ref>`; it refuses any ref but that of the held PR, of the PR closing the held issue, or of a PR closing one of its direct sub-issues. If Reviewer previously pushed the branch, inspect the effective rules and merge decision; an empty commit may not restore eligibility.

**Exit gate:** pushed head and check evidence, or a specific wait.

## 3. PR and readiness

Open a PR as a draft; only `ship` marks it ready, after author-mode `agent-review` posts `verdict=ready`, and has the Reviewer approve it, with no team-mode pass. Commit, push, open and auto-merge calls do only that; `afk` step 3, `plan` and `improve` stop at the labelled draft. When the caller asks to deliver the PR, after the risk label below start a fresh `agent-review` subagent at the pushed head. Brief it with PR, issue, base, head and last reviewed SHAs, the plan link; it loads `agent-review`, posts only with `review-post`, never prints the token and returns verdict, round and Important findings in at most 8 lines. Act on its verdict, first match wins: `fixes` invokes `pr-fix` then reviews again; `shape` fixes what the note names here, then reviews again, a second `shape` at the same head being reported; `split` invokes `spec`; `cap` is final: report it and start no further review or `pr-fix`; `ready` invokes `ship`. `pr-fix` alone fixes review threads; never dismiss blockers or resolve human ones.

Reuse an existing PR or open a draft; once open, a fresh subagent without implementation context reads the diff, issue and agent rules and sets exactly one label: `risk:R0` (docs, tests, local change), `risk:R1` (behaviour inside one boundary) or `risk:R2` (contracts, data, security, authority, concurrency or several boundaries). State the problem, change, scope, risks, evidence, and the plan's context and decisions; include real captures for visible changes. Link the issue and plan. Use `Closes #N` when merge completes the issue, and `Part of #N` only for an outcome awaiting deployed acceptance. Split work needing several PRs through `spec` into sub-issues; each PR closes one.

Run `node <this-skill-directory>/../../scripts/workflow.mjs review-context --pr <number>` for review facts; check missing information independently. Require effective code-owner protection, required checks and resolved owner holds before enabling auto-merge. If merge triggers production publication, apply `release` and its owner-approval and native-control gates before enabling it. The Reviewer identity may approve, turn on auto-merge or merge; it never pushes. Bind squash auto-merge to the current head (`--match-head-commit`); a changed head needs renewed review. Confirm GitHub accepted it; never wait for merge.

**Exit gate:** the labelled draft (a caller that reviews itself), a ready PR with auto-merge on at its head, a reported capped or split draft, or PR/head and the next actor and gate.

## 4. Tidy and report

Once merged or handed off, run `worktree tidy` as in step 1; never remove a tree by hand. It backs up uncommitted changes under `refs/backup/worktrees/`. Return at most 5 lines: PR/head, checks, review and merge state; next actor or reserved decision. Do not change settings, secrets or releases.

**Exit gate:** safe cleanup or a reason to defer it.
