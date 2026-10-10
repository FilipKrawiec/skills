---
name: vcs
description: Use when starting work on an issue, committing, branching, rebasing, pushing, opening a PR or getting a PR ready to merge.
allowed-tools: Bash(git:*,gh:*,lsof:*) Read
---

# Version Control

`<base>` and `<branchPrefix>` come from `.github/lanes.json` (defaults `main`, `agent/afk-`). Never edit, switch or stash the main checkout `<root>`; work in a worktree under `<root>/.worktrees/`. With a board (lanes.json `project`), move cards with `gh project item-edit`.

## 1. Start

- Start an issue only when each of your open PRs is ready to merge (phase 5) and shares no files with it; otherwise return `blocked by #<pr>`.
- Reuse the issue's worktree or unmerged branch; else branch from `origin/<base>`: unattended `<branchPrefix><N>-<slug>`, attended `<category>/<N>-<slug>`, or `<category>/<description>` without an issue (`feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `test`).
- Unattended: add `state:claimed` and comment ``Claimed by an AFK run on `<branch>`.``. Attended: add `state:started`. Card to In progress.

**Exit gate:** on the task's branch, the issue labelled; or `blocked by #<pr>`.

## 2. Commit

Stage only the task's paths. One Conventional Commit per green slice; squash `wip:` commits before the PR opens.

**Exit gate and output:** `📦 <short-sha> <type>: <description>`.

## 3. Push

Pass the verify gate (the project's `verify` task) before each push. Push over HTTPS as the host's machine user, never SSH: SSH pushes as the key's owner. Before the PR opens, rebase on `origin/<base>` and push `--force-with-lease`; once it is open, merge `origin/<base>`, never rebase: a rewritten history detaches review threads and races the reviewer.

**Exit gate:** the push exits 0.

## 4. Open the PR

- Ready, never a draft: a draft never auto-merges. For an issue, use its title. Every PR uses this body envelope (omit inapplicable sections): summary ≤ 3 sentences; scope, risks and decision one line each. Keep blockers, unfixed findings and owner choices visible, with options and a recommendation when needed. Collapse evidence with `<details>` / `<summary>` and blank lines around Markdown. Use no CSS or scripts. Add fenced `mermaid` with text only when a diagram clarifies a flow or relationship.

  ```markdown
  ## Executive summary
  A second reservation previously persisted; it now fails before saving.

  **Scope:** reservation service and unit tests; API unchanged.
  **Risks:** concurrent requests remain outside this change.
  **Decision:** Required owner approval pending; recommend approval.

  Closes #42

  Plan: https://github.com/example/project/issues/42#issuecomment-123

  <details>
  <summary>Review and checks</summary>

  ## Review
  APPROVED after round 2; findings fixed in 1a2b3c4, 5d6e7f8.

  ## Checks
  `just verify` exit 0.

  </details>

  <details>
  <summary>Before / after evidence</summary>

  ## Before / after
  `test_duplicate_is_rejected`: second call fails; one reservation persists.

  </details>
  ```

- For a revert: title `revert: <subject>`; body `Reverts #<M>` and the failing checks, never `Closes`, which would close the reverted issue.
- Include before/after captures for each visible change in the evidence section.
- List unfixed findings under Decision; open one as a `lane:owner` issue only on the owner's yes.
- Every PR, attended or not, revert and lesson PRs too: `gh pr merge <pr> --squash --auto`; auto-merge still waits for required approvals and checks. Remove the `state:` label.

**Exit gate:** the PR URL with auto-merge on.

## 5. Ready to merge

Run after every push, when `<base>` moves, and before calling a PR ready.

1. Blockers: draft, failing checks, conflicts or `BEHIND`, unresolved threads, `CHANGES_REQUESTED`. Fix them and every review finding with a clear fix, optional ones too; reply on each thread naming the commit.
2. A fresh-context worker that never edits resolves the threads it confirms fixed. A person's threads stay theirs; name them to the owner.
3. Repeat until only pending checks or the required approval remain.

**Exit gate:** no other blocker.

**Output:** ≤ 5 lines. **Summary:** the PR and its blockers, or "ready". **Decision:** approve it, or "Nothing needed." while blockers remain.

## 6. Tidy

Remove other `<branchPrefix>` worktrees and branches whose PR merged or closed, when clean and `lsof -a -d cwd +D <worktree>` exits 1 (no session inside).

**Exit gate:** `git worktree list` shows none.

## Authority

Merge, approve or force-push a protected or default branch only on the owner's word. Never dispatch workflows, touch releases, secrets or variables, or delete branches, tags or repositories other than your own merged head.
