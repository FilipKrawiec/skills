---
name: vcs
description: Use when committing, branching, rebasing, pushing or moving files with Git.
allowed-tools: Bash(git:*,gh:*,python3:*) Read
---

# Version Control

Worktrees, branch names, opening the PR, the Merge gate and cleanup follow [board.md](../../references/board.md)'s Issue steps. Outside the issue cycle, name branches `<category>/<description>` (`feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `test`).

## 1. Preflight

Run `git status --short --branch`; work in the task's worktree and leave the session's starting checkout as it is.

**Exit gate:** you are in the task's worktree on its branch.

## 2. Stage

- `git add <paths>` for files the task changed only; leave unrelated user changes unstaged.
- Move with `git mv`, delete with `git rm`.
- Read `git diff --staged`.

**Exit gate:** the staged diff holds only task changes.

## 3. Commit

- One Conventional Commit per green slice: `<type>[(<scope>)][!]: <imperative description>`; pair `!` with a `BREAKING CHANGE:` footer.
- `wip:` commits stay local; squash them before the PR opens.
- For review feedback on an open PR, add a commit, then settle its thread per the Merge gate's step 2.

**Exit gate and output:** one line, `📦 <short-sha> <type>: <description>`.

## 4. Sync and push

- Before the PR opens: `git fetch origin && git rebase origin/<base>`. Once open: `git merge origin/<base>`, never rebase. Rerun required checks after resolving conflicts.
- `git push -u origin <branch>`; after a rebase, `--force-with-lease`.
- After every push to an open PR, run board.md's Merge gate.

**Exit gate:** the branch is pushed and the Merge gate's output is in hand.

## Merge Authority

Commit, push task branches and open or update PRs freely. Merge, approve, or force-push a protected or default branch only on the owner's explicit word; `lanes.py merge` (board.md's Open PR step) is that word for a PR no owner rule matches, and `agent-review` approves only a `ready` PR, as the reviewer.
