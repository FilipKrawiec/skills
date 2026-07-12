---
name: vcs
description: Use when performing Git or version control operations, including branching, commits, rebases, squashes, force-with-lease pushes, merges, and file moves.
---

# Version Control System (VCS) Workflow

Follow these steps for all version control and git operations to maintain a clean, readable, and linear history.

## Steps

1. **Preflight State:** Check branch, upstream, and worktree status before edits, staging, commits, pull requests, merges, and cleanup. Preserve unrelated user changes.
2. **Worktree Per Task:** Create a dedicated worktree and short-lived branch for the task. Keep the primary worktree on main/trunk.
3. **Execute File Operations:** If moving or renaming files, use `git mv` instead of standard `mv` to preserve Git revision history.
4. **Stage Intentionally:** Stage only files that belong to the current task; inspect staged changes before committing.
5. **Commit Logically:** Write atomic commits using the Conventional Commits format, prefixed with `#<task-id>` if linked to an issue tracker.
6. **Integrate and Sync:** Rebase the task branch onto current main/trunk, squash it into one cohesive trunk commit in the primary worktree, then push and verify the remote ref.

## Context Pointers

- Read [branch-management.md](references/branch-management.md) when naming branches, branching off main, or managing branch lifecycles.
- Read [commit-guidelines.md](references/commit-guidelines.md) when writing commit messages or creating commits.
- Read [integration-policies.md](references/integration-policies.md) when rebasing, squashing, force-pushing, or merging code.
- Read [file-operations.md](references/file-operations.md) when renaming, moving, or deleting files.
