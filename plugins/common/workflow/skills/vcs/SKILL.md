---
name: vcs
description: Use when performing Git or version control operations, including branching, commits, rebases, squashes, force-with-lease pushes, merges, and file moves.
allowed-tools: Bash(git:*) Read
---

# Version Control System (VCS) Workflow

Follow these steps for all version control and git operations to maintain a clean, readable, and linear history.

## Execution Phases

### Phase 1: Preflight & Branch Isolation
1. Inspect working tree status: `git status --short --branch`.
2. Whenever creating a new worktree or starting new work, update the original main branch first: fetch and fast-forward or update main to the latest upstream state (`git fetch origin main:main` or switch to main and pull).
3. Create a short-lived task branch in a dedicated worktree from the updated main (`git worktree add <path> -b <branch-name> main`). Name it `<category>/<task-id>-<description>` (category: `feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `test`); omit `<task-id>` when the tracker supplies none.
*Exit Gate*: Working directory is clean and isolated on the task branch branched from updated main.

### Phase 2: Atomic Staging & Inspection
1. Stage only files modified within the active task boundary: `git add <paths>`. Unrelated user changes stay unstaged.
2. Move and rename with `git mv`, delete with `git rm`, so history and blame survive.
3. Inspect the staged diff: `git diff --staged`.
*Exit Gate*: Staged diff contains only intentional, task-scoped changes.

### Phase 3: Conventional Commit Creation
1. Write an atomic Conventional Commit: `[#<task-id> ]<type>[(<scope>)][!]: <imperative description>`. Add the `#<task-id>` prefix only when the tracker convention requires it; pair `!` with a `BREAKING CHANGE:` footer; reserve `wip:` for local commits squashed before review.
2. When addressing review feedback, amend the task commit (`git commit --amend`) so the branch keeps one cohesive commit.
*Exit Gate*: Commit created with clean git log entry.
*Output Envelope*:
```text
📦 Commit Hash: `<short-sha>`
📝 Message: `<type>: <description>`
```

### Phase 4: Sync & Push
1. Integrate upstream by rebasing onto `origin/main` (`git fetch origin && git rebase origin/main`); rerun required checks after resolving conflicts.
2. Push branch to remote: `git push -u origin <branch-name>`; after a rebase, push with `--force-with-lease`.
3. Open Review Request linking the Delivery Record identifier. Each task lands on main as exactly one cohesive commit (squash merge).
*Exit Gate*: Branch is pushed with clean verification pass.

### Phase 5: Post-Merge & Worktree Cleanup
1. Once merged into main, delete the remote head branch (host auto-delete or `git push origin --delete <branch-name>`).
2. Remove the task worktree: `git worktree remove <worktree-path>`, then delete the local branch: `git branch -d <branch-name>`.
3. Prune remote tracking references: `git remote prune origin`; confirm `main...origin/main` is neither ahead nor behind.
*Exit Gate*: Worktree removed, local merged branch deleted, and remote tracking refs pruned.

---

## Delivery Authority & Merge Rules

- Agents may create commits, push verified task branches, and publish or update Review Requests as normal delivery work. Once specification and plan are durable, create exactly one durable Delivery Record for the cohesive delivery slice in the configured tracker; the configured host integration may close or update it on merge.
- The user retains merge authority. Do not merge, approve, or force-push a protected/default branch unless the user explicitly authorizes that action.
