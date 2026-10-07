---
name: vcs
description: Use when committing, branching, rebasing, pushing or moving files with Git.
allowed-tools: Bash(git:*,gh:*,python3:*) Read
---

# Version Control

Keep history linear and readable. Worktrees, branch names, opening the PR, the Merge gate and cleanup follow [board.md](../../references/board.md)'s Issue steps. Work outside the issue cycle uses `<category>/<description>` as the branch name (category: `feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `test`).

## 1. Preflight
Run `git status --short --branch` and work in the task's worktree; the checkout a session started in stays as it is.

*Exit gate*: the working directory is the task's worktree on its branch.

## 2. Stage
1. Stage only files the task changed: `git add <paths>`. Unrelated user changes stay unstaged.
2. Move and rename with `git mv`, delete with `git rm`, so history and blame survive.
3. Inspect `git diff --staged`.

*Exit gate*: the staged diff holds only intentional, task-scoped changes.

## 3. Commit
1. Write one Conventional Commit per green slice: `<type>[(<scope>)][!]: <imperative description>`; pair `!` with a `BREAKING CHANGE:` footer; `wip:` commits stay local and are squashed before the PR opens.
2. For review feedback on an open PR, add a commit (the squash merge lands the PR as one commit), then settle its thread as the Merge gate's step 2 says.

*Exit gate and output*: one line, `📦 <short-sha> <type>: <description>`.

## 4. Sync and push
1. Before the PR opens, `git fetch origin && git rebase origin/<base>`; once it is open, `git merge origin/<base>` so reviewers' checkouts stay valid. Rerun required checks after resolving conflicts.
2. `git push -u origin <branch>`; after a rebase, `--force-with-lease`.
3. After every push to an open PR, run board.md's Merge gate.

*Exit gate*: the branch is pushed and the Merge gate's output is in hand.

## Merge Authority

Agents commit, push task branches and open or update PRs. Merging, approving and force-pushing a protected or default branch happen only on the owner's explicit word; `lanes.py merge` (board.md's Open PR step) is that word for a PR that matches no owner rule, so it auto-merges on green checks.
