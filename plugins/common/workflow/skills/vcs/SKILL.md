---
name: vcs
description: Use when starting work on an issue, committing, branching, rebasing, pushing, opening a PR or getting a PR ready to merge.
allowed-tools: Bash(git:*,gh:*,lsof:*) Read
---

# Version Control

`<repo>` (`owner/name`), `<base>` and `<branchPrefix>` come from `.github/lanes.json` (defaults `main`, `agent/afk-`); `<root>` is the main checkout. Never edit, switch or stash `<root>`; work in a worktree. With a board (lanes.json `project`), move cards with `gh project item-edit`.

## 1. Start

- Hold one unfinished PR: start an issue only when each of your open PRs is ready to merge (phase 6) and shares no files with it; otherwise stop and return `blocked by #<pr>`. Merge dependent changes in order.
- Unless already on the task's branch: `git fetch origin <base>`; reuse the issue's worktree, or `git switch <branch>` to its unmerged `<branchPrefix><N>-*` branch; else `git worktree add <root>/.worktrees/<N>-<slug> -b <branch> origin/<base>`, or, when the host gave the session a clean worktree, `git switch -c <branch> origin/<base>` there.
- Branch: unattended `<branchPrefix><N>-<slug>`; attended `<category>/<N>-<slug>`, or `<category>/<description>` without an issue (`feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `test`).
- For an issue: unattended, add `state:claimed` and comment ``Claimed by an AFK run on `<branch>`.``; attended, add `state:started`. Card to In progress.

**Exit gate:** `git status --short --branch` shows the task's branch, and the issue carries its `state:` label; or `blocked by #<pr>`.

## 2. Stage

- `git add <paths>` the task changed only; leave unrelated changes unstaged. Move with `git mv`, delete with `git rm`.
- Read `git diff --staged`.

**Exit gate:** the staged diff holds only task changes.

## 3. Commit

- One Conventional Commit per green slice: `<type>[(<scope>)][!]: <imperative description>`; pair `!` with a `BREAKING CHANGE:` footer.
- Squash `wip:` commits before the PR opens.

**Exit gate and output:** `📦 <short-sha> <type>: <description>`.

## 4. Push

- Before the PR opens: `git fetch origin && git rebase origin/<base>`, then push with `--force-with-lease`. Once it is open: `git merge origin/<base>`, never rebase. Rerun required checks after resolving conflicts.
- Push and run `gh` as the implementer machine user the host set up: an HTTPS remote whose credential helper and `GH_TOKEN` hold its token. Never push over SSH, which pushes as the key's owner; never print a token.

**Exit gate:** `git push -u origin <branch>` exits 0.

## 5. Open the PR

- `gh pr create`, ready, never a draft. For an issue: its title; body `Closes #<N>`, the `## Plan` link, the review verdict with its fixing commits, checks run, before and after captures of visible changes. For a revert: the given title; body `Reverts #<M>` and the failing checks, never `Closes`.
- List each finding left unfixed under Decision; on the owner's yes, open it as a linked `lane:owner` issue.
- `gh pr merge <pr> --squash --auto`: it lands on the required approval. Remove `state:claimed` or `state:started`.

**Exit gate:** the PR URL with auto-merge on.

## 6. Ready to merge

Run after every push to an open PR, when `<base>` moves, and before calling a PR ready.

1. Blockers: draft; failing checks; `CONFLICTING`, `DIRTY` or `BEHIND`; an unresolved thread; `CHANGES_REQUESTED`. Read them with `gh pr view <pr> --json isDraft,mergeable,mergeStateStatus,reviewDecision`, `gh pr checks <pr>` and `gh api graphql -f query='{repository(owner:"<owner>",name:"<name>"){pullRequest(number:<pr>){reviewThreads(first:100){nodes{isResolved path line comments(first:1){nodes{author{login} body}}}}}}}'`.
2. Fix every review finding with a clear fix, optional ones too, and reply on its thread naming the commit. Then dispatch a fresh-context worker with no implementation context: it never edits or pushes, resolves the threads it confirms fixed and hands the rest back. A person's threads stay theirs; name each to the owner.
3. Fix failing checks and conflicts (`git merge origin/<base>`), push, and start again at 1.

**Exit gate:** no blocker but pending checks or the required approval.

**Output:** ≤ 5 lines. **Summary:** the PR and its blockers, or "ready". **Decision:** approve or merge it, or "Nothing needed." while blockers remain.

## 7. Tidy

Remove other `<branchPrefix>` worktrees and branches whose PR merged or closed, when the worktree is clean and `lsof -a -d cwd +D <worktree>` exits 1.

**Exit gate:** `git worktree list` shows no such worktree.

## Authority

- Merge, approve, or force-push a protected or default branch only on the owner's explicit word.
- Never dispatch workflows, create, edit or delete releases, write secrets or variables, or delete branches, tags or repositories other than your own merged head.
