---
name: plan
description: Use when planning the implementation of a specified issue from the repository (phase 03 Plan), before any code changes, or when resuming an issue from its posted plan.
allowed-tools: Read Bash(gh:*,git:*,python3:*)
---

# Plan (03)

Prepare a concrete plan, grounded in the actual repository, that execution follows without re-planning the basics. The plan lives on the issue so the next session resumes from facts, not recollection. This skill changes no code.

Run `python3 <the afk skill's directory>/scripts/lanes.py phase <N>` (`LANES phase <N>`) before and after this skill; do the step it prints.

## 1. Read

Read the issue, its acceptance criteria, scope packet, parent and linked decisions; then the code, tests and contracts near the scope paths, and the project's agent rules. When the issue already has a `## Plan` comment, read it and the branch to see where work stopped.

**Exit gate:** each acceptance criterion maps to code and tests you have read.

## 2. Draft

Draft the plan:

- Files likely to change, inside the scope packet.
- For each acceptance criterion, the failing test that proves it.
- Ordered implementation steps, each small and verifiable.
- Risks, assumptions and anything that could send the work back to `spec`.

When the plan needs a path outside the scope packet or a protected path, or an acceptance criterion turns out ambiguous, stop: unattended runs park the issue; attended sessions return to `spec`.

**Exit gate:** a draft that stays inside the scope packet.

## 3. Approve and post

- Attended: show the draft and wait for the owner to approve or adjust it.
- Unattended: the owner's `lane:afk` approval of the specified issue stands in.

Post the approved plan as one issue comment headed `## Plan` (edit the existing one when resuming), then run `LANES phase <N>`. Keep the comment current whenever execution departs from it.

**Exit gate:** `LANES phase <N>` prints `advanced: 03 Plan → 04 Execute`.

## Output

One line: the plan comment link and its step count, or the reason the issue went back.
