---
name: vcs
description: Use when starting work on an issue, committing, branching, rebasing, pushing, opening a PR or getting a PR ready to merge.
allowed-tools: Bash(git:*,gh:*,lsof:*) Read
---

# Version Control

`<base>` and `<branchPrefix>` come from `.github/lanes.json` (defaults `main`, `agent/afk-`). Never edit, switch or stash the main checkout `<root>` (the first entry of `git worktree list`). Use an isolated worktree; wait if another holds the branch. Move configured board cards with `gh project item-edit`.

## 1. Start

- Start an issue only when each of your open PRs is ready to merge (phase 5) and shares no files with it, including a proposed parent; otherwise return `blocked by #<pr>`.
- Reuse the issue's unmerged branch, and its worktree unless the host made one for the session; else fetch and branch from `origin/<base>`; wait for any parent to merge first: unattended `<branchPrefix><N>-<slug>`, attended `<category>/<N>-<slug>`, or `<category>/<description>` without an issue (`feature`, `bugfix`, `hotfix`, `refactor`, `chore`, `test`).
- Re-read active state labels; stop on another assignment, never overwrite it. Unattended: add `state:claimed` and comment ``Claimed by an AFK run on `<branch>`.``. Attended: add `state:started`. Card to In progress.

**Exit gate:** on the task's branch, the issue labelled; or `blocked by #<pr>` or `<worktree>`.

## 2. Commit

Stage only the task's paths. One Conventional Commit per green slice; squash `wip:` commits before the PR opens.

**Exit gate and output:** `📦 <short-sha> <type>: <description>`.

## 3. Push

Pass the verify gate (the project's `verify` task) for each changed push. Push over HTTPS as the host's machine user, never SSH: SSH pushes as the key's owner. Before the PR opens, rebase on `origin/<base>` and push `--force-with-lease`; once it is open, merge `origin/<base>`, never rebase: a rewritten history detaches review threads and races the reviewer.

**Exit gate:** the push exits 0.

## 4. Open the PR

- Ready, never a draft. Wait for a parent to merge before starting dependent work; do not open stacked drafts. For an issue, use its title. Envelope: summary ≤3 sentences; scope, risks and decision one line each. Show blockers and owner choices with recommendations. Collapse evidence with `<details>` / `<summary>` and blank lines around Markdown.

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
  ```

- For a revert: title `revert: <subject>`; body `Reverts #<M>` and the failing checks, never `Closes`, which would close the reverted issue.
- Include before/after captures for each visible change in the evidence section.
- Require fresh independent review of both axes for this exact head before opening; host-dispatched leaves return verdicts and evidence. These read-only code verdicts need no approval credentials; GitHub approval remains a separate `agent-review` gate. Fix blockers; record optional suggestions without forcing fixes. Quote exact-head verdicts and valid checks in the PR.
- Every PR, attended or not, revert and lesson PRs too: `gh pr merge <pr> --squash --auto`; auto-merge still waits for required approvals and checks. Remove the `state:` label.

**Exit gate:** the PR URL, auto-merge on.

## 5. Ready to merge

Run after every push, when `<base>` moves, and before calling a PR ready.

1. Blockers: draft, failing checks, conflicts or `BEHIND`, unresolved threads, `CHANGES_REQUESTED`. Fix blocking findings; reply on each thread naming the commit.
2. Ask the host for a fresh read-only leaf to verify agent thread fixes; human threads stay theirs. Supply this complete brief:

   ```text
   Intent/criteria: <issue outcome and acceptance criteria>.
   Scope: <paths, tests, exclusions, dependencies>.
   Checkout: <worktree>; base <ref/SHA>; head <branch/SHA>.
   Decisions/evidence: <constraints, findings, commands/exits>.
   Verify fixes only; no dispatch or edits. Return exact-head verdict,
   fixing commits, evidence and remaining decisions in at most 8 lines.
   ```
3. Recheck head SHA and required checks; invalidate approvals/evidence after head movement. Request a fresh independent review for the exact head. Bind auto-merge to it with `--match-head-commit <head>`.
4. Repeat until only pending checks, the required approval or an open parent remain.

**Exit gate:** no other blocker.

**Output:** ≤ 5 lines. **Summary:** the PR and its blockers, or "ready". **Decision:** name the next action and its actor: agent fixes/retries, required reviewer approval, or a reserved owner choice. Use "Nothing needed." only when this assignment has no pending action.

## 6. Tidy

Remove only this assignment’s `<branchPrefix>` worktrees and branches whose PR merged or closed, when clean and `lsof -a -d cwd +D <worktree>` exits 1 (no session inside).

**Exit gate:** owned completed worktrees removed; others preserved.

## Authority

`agent-review` approval authorizes routine merges matching no owner rule. Owner-matching PRs and protected/default force-pushes require explicit owner authorization. Production requires exact owner approval for candidate and destination, beyond branch restriction. Never dispatch workflows, touch releases, secrets or variables, or delete branches, tags or repositories other than your own merged head.
