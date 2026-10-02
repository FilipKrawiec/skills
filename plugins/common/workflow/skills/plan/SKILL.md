---
name: plan
description: Use when planning the implementation of a specified issue from the repository (phase 03 Plan), before any code changes, or when resuming an issue from its posted plan.
allowed-tools: Read Bash(gh:*,git:*,python3:*)
---

# Plan (03)

Prepare a concrete plan, grounded in the actual repository, that execution follows without re-planning the basics. The plan lives on the issue so the next session resumes from facts, not recollection. This skill changes no code.

`LANES` means `python3 <the afk skill's directory>/scripts/lanes.py`.

## 1. Read

Read the issue, its acceptance criteria, scope packet, parent and linked decisions; then the code, tests and contracts near the scope paths, and the project's agent rules. When the issue already has an `AFK plan` comment, read it and the branch to see where work stopped.

**Exit gate:** each acceptance criterion maps to code and tests you have read.

## 2. Plan

Write the plan as one issue comment headed `AFK plan` (edit the existing one when resuming):

- Files likely to change, inside the scope packet.
- For each acceptance criterion, the failing test that proves it.
- Ordered implementation steps, each small and verifiable.
- Risks, assumptions and anything that could send the work back to `spec`.

When the plan needs a path outside the scope packet or a protected path, or an acceptance criterion turns out ambiguous, stop: unattended runs park the issue; attended sessions return to `spec`.

**Exit gate:** the plan comment is posted and `LANES mark <N> planned` moved the issue to 04 Execute.

## 3. Approve

- Attended: show the plan and wait for the owner to approve, adjust or reject it before execution.
- Unattended: the owner's `lane:afk` approval of the specified issue stands in, as long as the plan stays inside the scope packet.

Keep the comment current during execution whenever reality departs from it.

**Exit gate:** an approved plan, or a parked or returned issue.

## Output

One line: the plan comment link and its step count, or the reason the issue went back.
