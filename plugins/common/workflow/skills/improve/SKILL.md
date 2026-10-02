---
name: improve
description: Use when a change has shipped (phase 07 Improve), or when friction, rework, a repeated review finding or an owner correction should become a lasting change to skills, agent rules, docs or assets.
allowed-tools: Skill Read Bash(gh:*,git:*)
---

# Improve (07)

Close the cycle by making the system learn: remove friction at its source instead of relying on anyone's memory. Lessons are proposals until the owner accepts them.

Card moves follow [board.md](../../references/board.md).

## 1. Collect

For the shipped issue (07 Improve on the board) or the current session, gather what slowed the cycle or caused rework: parks and their questions, failed fix attempts, review findings (especially ones raised on two or more PRs), red pipelines after merge, owner corrections, missing commands or docs.

**Exit gate:** a list of friction points with their evidence (links or `file:line`), or none.

## 2. Place

For each friction point, name where the lesson belongs and the proposed wording:

| Lesson | Belongs in |
| --- | --- |
| An agent skipped or misread a step | The skill that owns that phase |
| A project-specific rule was missing | The project's agent rules (`AGENTS.md` or equivalent) |
| A scope, protection or merge rule misfired | `.github/lanes.json` |
| An issue arrived unbuildable | The issue template, or the `spec` checks |
| Users or developers lacked information | Application docs or assets |

Keep only lessons that change future behavior. Before writing it, scrub secrets, internal hostnames, client names and local paths.

**Exit gate:** each lesson has one target file and its proposed change.

## 3. Record

Post the lessons as one comment on the shipped issue headed `## Lessons` ("no lessons" when there are none), each with its target file and proposed wording.

- Unattended: name the lessons in the run's output too; the owner decides later. Lessons from a run's own friction, with no shipped issue to hold them, go in the output only.
- Attended, or when the owner accepts a lesson from an earlier `## Lessons` comment: ask the owner about each lesson. For each one accepted, invoke `define` to open an issue carrying the target file and the wording (in the upstream library's repository when the lesson is for its skill), and link it from the `## Lessons` comment. The lesson then runs through the cycle like any other work.

Then move the card to Done: the cycle is closed.

**Exit gate:** the `## Lessons` comment linking an issue for each accepted lesson, and the card in Done when there is a board.

## Output

One line per lesson: target file, the change in a few words and its issue when accepted; or "no lessons".
