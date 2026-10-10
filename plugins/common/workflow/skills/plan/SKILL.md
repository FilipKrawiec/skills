---
name: plan
description: Use when an issue is specified and needs its implementation plan before code changes (03 Plan), or when resuming work from a posted plan.
allowed-tools: Skill Read Bash(gh:*,git:*)
---

# Plan (03)

Write a plan execution follows without re-planning. Unless the issue carries `state:claimed` or `state:started`, first invoke `vcs` to start it.

**Unattended:** the same phases; `lane:afk` stands in for approval, and a park replaces every question: replace `lane:afk` and `state:*` with `lane:owner`, and comment the question, options and recommendation in ≤ 5 lines.

## 1. Read

Read the issue, its acceptance criteria, scope packet (its ```` ```scope ```` block of paths the work may touch), parent and linked decisions; then the code, tests and agent rules it touches. When a `## Plan` comment exists, read it and the branch to find where work stopped.

**Exit gate:** each acceptance criterion maps to code and tests you have read.

## 2. Draft

- Files to change, inside the scope packet when there is one.
- Per acceptance criterion, the failing test that proves it.
- Ordered steps. Each names its file, the types and signatures it adds or changes, its failing test (name and assertion) and the command that proves it, so a fast model executes it without judgment.
- Decide every choice here; a step saying "choose", "decide" or "if needed" is unfinished.
- Risks that could send the work back to `spec`.

A path outside the scope packet, a path `.github/CODEOWNERS` or lanes.json `ownerPaths` gives the owner, or an ambiguous criterion stops the plan: unattended, park; attended, remove `state:started` (with a board, card to Todo) and invoke `spec`.

**Exit gate:** a draft inside the scope packet whose every step names file, test and command and leaves no choice, or a parked or released issue.

## 3. Approve and post

- Attended: show the draft; wait for approval or changes.
- Post it as one issue comment headed `## Plan` only in `lane:afk` or when the work may outlive the session.
- When resuming or departing from it, edit that comment in place by its id (`gh api -X PATCH`). Never `gh issue comment --edit-last`; it may hit another session's comment.

**Exit gate:** the `## Plan` comment link, or the owner's approval in the session.

## Output

≤ 5 lines. **Summary:** step count, and the comment link when posted. **Decision:** the plan to approve (attended), or why the issue went back and its question, with a recommendation.
