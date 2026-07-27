---
name: vcs
description: Use when performing Git or version control operations, including branching, commits, rebases, squashes, force-with-lease pushes, merges, and file moves.
---

# Version Control System (VCS) Workflow

Follow these steps for all version control and git operations to maintain a clean, readable, and linear history.

## Steps

1. **Preflight State:** Check branch, upstream, and worktree status before edits, staging, commits, Review Requests, merges, and cleanup. Preserve unrelated user changes.
2. **Worktree Per Task:** Create a dedicated worktree and short-lived branch for the task. Keep the primary worktree on main/trunk.
3. **Execute File Operations:** MANDATORY: Always use `git mv` (never standard shell `mv` or creating/deleting copies) for all file moves and renames to preserve Git revision history and blame tracking.
4. **Stage Intentionally:** Stage only files that belong to the current task; inspect staged changes before committing.
5. **Commit Logically:** Write atomic commits using the Conventional Commits format, prefixed with the Delivery Record identifier when the configured tracker convention uses one.
6. **Integrate and Sync:** Once the specification and plan are durable, create exactly one durable Delivery Record for the cohesive delivery slice in the configured tracker. Rebase the task branch onto current main/trunk when needed, push its verified branch, and publish or update its Review Request. Every published Review Request links exactly one Delivery Record; the configured host integration may close or update it on merge. Leave merging to the user unless they explicitly authorize it.

## Delivery Authority

Agents may create commits, push verified task branches, and publish or update Review Requests as normal delivery work, including AFK tasks when their packet permits it. A Review Request is the required safety and review boundary for non-AFK work. The Delivery Record records business intent, acceptance criteria, plan/task boundaries, and verification context. The agent uses the configured tracker and review provider; it does not hard-code a host API or flow. Do not require a Delivery Record for chat-only ideation, pure local experiments, or unpushed work. Existing Review Requests that predate this rule are historical exceptions pending user choice; do not create a Delivery Record for them without explicit user authorization.

The user retains merge authority. Do not merge, approve, or force-push a protected/default branch unless the user explicitly authorizes that exact action. Report a ready branch, Review Request, and verification evidence when a user decision is needed.

## Context Pointers

- Read [branch-management.md](references/branch-management.md) when naming branches, branching off main, or managing branch lifecycles.
- Read [commit-guidelines.md](references/commit-guidelines.md) when writing commit messages or creating commits.
- Read [integration-policies.md](references/integration-policies.md) when rebasing, squashing, force-pushing, or merging code.
- Read [file-operations.md](references/file-operations.md) when renaming, moving, or deleting files.
