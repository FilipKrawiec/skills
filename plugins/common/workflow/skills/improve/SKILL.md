---
name: improve
description: Use when a change has shipped (phase 07 Improve), or when friction, rework, a repeated review finding or an owner correction should become a durable change to skills, agent rules, docs or assets so the next cycle is easier.
allowed-tools: Skill Read Edit Bash(gh:*,git:*,python3:*)
---

# Improve (07)

Close the cycle by making the system learn: remove friction at its source instead of relying on anyone's memory. Lessons are proposals until the owner accepts them.

`LANES` means `python3 <the afk skill's directory>/scripts/lanes.py`.

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

Drop a lesson that would not change future behavior. Before writing it, scrub secrets, internal hostnames, client names and local paths.

**Exit gate:** each lesson has one target file and its proposed change.

## 3. Record

- Unattended: post the lessons as one comment on the shipped issue headed `Lessons`, and name them in the run's output. Agent rules, skills and lanes.json are protected; the owner applies them.
- Attended: apply the lessons the owner accepts in a branch (invoke `writing-great-skill` when the target is a skill in its repository), and open a PR; a lesson for an upstream skill library becomes an issue there after the owner's yes.

Then `LANES mark <N> learned` when there were no lessons or the owner applied or declined them, moving the issue to Done.

**Exit gate:** the lessons comment or PR, and the issue marked learned once the owner settled them.

## Output

One line per lesson: target file and the change in a few words; or "no lessons".
