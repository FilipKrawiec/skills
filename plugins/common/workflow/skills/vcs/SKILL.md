---
name: vcs
description: Use when committing, branching, rebasing, pushing or moving files with Git.
allowed-tools: Bash(git:*) Read
---

# Version Control System (VCS) Workflow

Follow these steps for all version control and git operations to maintain a clean, readable, and linear history. Worktrees, branch names, opening the PR and cleanup follow [board.md](../../references/board.md): the Claim or Start step makes the worktree from `origin/<base>` on `<branchPrefix><N>-<slug>`, the Open PR step publishes it, and Tidy removes it. Work outside the issue cycle uses the same shape with `<category>/<description>` as the branch name (category: `feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `test`).

## Execution Phases

### Phase 1: Preflight
1. Inspect working tree status: `git status --short --branch`.
2. Work in the task's worktree; the checkout a session started in stays as it is.
*Exit Gate*: The working directory is the task's worktree on its branch.

### Phase 2: Atomic Staging & Inspection
1. Stage only files modified within the active task boundary: `git add <paths>`. Unrelated user changes stay unstaged.
2. Move and rename with `git mv`, delete with `git rm`, so history and blame survive.
3. Inspect the staged diff: `git diff --staged`.
*Exit Gate*: Staged diff contains only intentional, task-scoped changes.

### Phase 3: Conventional Commit Creation
1. Write an atomic Conventional Commit: `<type>[(<scope>)][!]: <imperative description>`, one per green slice; pair `!` with a `BREAKING CHANGE:` footer; reserve `wip:` for local commits squashed before the PR opens.
2. When addressing review feedback on an open PR, add a commit; the squash merge lands the PR as one commit. Reply on each review thread with the commit that fixes it, and resolve an agent-written thread once the fix is verified at the head; a person's thread waits for them or their word. A base branch that requires resolved conversations stays `BLOCKED`, even with green checks, while any thread is open.
*Exit Gate*: Commit created with clean git log entry.
*Output Envelope*:
```text
📦 Commit Hash: `<short-sha>`
📝 Message: `<type>: <description>`
```

### Phase 4: Sync & Push
1. Integrate upstream: before the PR opens, `git fetch origin && git rebase origin/<base>`; once it is open, `git merge origin/<base>` so reviewers' checkouts stay valid. Rerun required checks after resolving conflicts.
2. Push: `git push -u origin <branch>`; after a rebase, `--force-with-lease`.
3. Publish through board.md's Open PR step; each task lands on the base branch as exactly one squash-merged commit.
*Exit Gate*: Branch is pushed with a clean verification pass.

---

## Delivery Authority & Merge Rules

- Agents commit, push verified task branches, and open or update PRs as normal delivery work.
- The owner retains merge authority: merging, approving and force-pushing a protected or default branch happen only on the owner's explicit word (the `afk` gates `automerge` and `merge-reviewed` are that word for chores and agent-reviewed AFK PRs).
