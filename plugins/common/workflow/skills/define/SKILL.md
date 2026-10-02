---
name: define
description: Use when turning a raw need, idea, bug report or business request into a GitHub issue (phase 01 Define), before anyone specifies or builds it.
allowed-tools: Read Bash(gh:*,git:*)
---

# Define (01)

Turn a raw need into one issue: a stable place for the work to evolve. Define captures intent; `spec` makes it buildable. Its only output is the issue.

When the project has a board, add the new issue to 01 Define per [board.md](../../references/board.md).

## 1. Capture

From the request and the conversation, write down:

- The problem and the outcome that shows it is solved.
- Why it matters now: who needs it, deadlines, constraints.
- Candidate non-goals, known risks and dependencies.
- Open questions, marked as open rather than assumed.

Ask the owner only what the request leaves out; keep implementation detail out.

**Exit gate:** each point above is filled or marked open.

## 2. Check for duplicates

Search open and closed issues for the same intent (`gh issue list -s all --search "<keywords>"`, with `-R <owner/repo>` when the caller names another repository; `gh issue create` takes the same flag). When one matches, show it and ask whether to update it instead.

**Exit gate:** no duplicate, or the owner chose the existing issue.

## 3. Create

Create the issue with the project's issue template: title `<type>(<area>): <outcome>`, the captured intent as the description, the open questions as a list, a `type:` label, and `priority:` when the owner gave one. Add `lane:owner`: the owner steers it until `spec` decides its lane. Unattended runs name follow-ups in their output for the owner instead of creating issues.

**Exit gate:** the issue URL, on the board in 01 Define when there is one.

## Output

One line: the issue link and its open questions count.
