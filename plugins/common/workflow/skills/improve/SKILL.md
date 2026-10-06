---
name: improve
description: Use when a change has shipped (07 Improve) or friction, rework or a repeated review finding should become a lasting change to skills, agent rules or docs.
allowed-tools: Skill Read Edit Write Bash(gh:*,git:*,python3:*,just:*)
---

# Improve (07)

Close the cycle by making the system learn: remove friction at its source instead of relying on anyone's memory. Each lesson arrives as a PR and lands like any other: the owner sees it when an owner rule matches (a lesson for agent rules or automation touches protected paths), and can close any lesson to reject it.

**With the owner:** every phase; the owner may drop a lesson before phase 4. **Unattended:** every phase; the owner decides on each lesson's PR later.

## 1. Collect

For the shipped issue (07 Improve in [board.md](../../references/board.md)'s States) or the current session, gather what slowed the cycle or caused rework: parks and their questions, failed fix attempts, review findings (especially ones raised on two or more PRs), red pipelines after merge, owner corrections (including ones an agent saved to its own memory), missing commands or docs.

**Exit gate:** a list of friction points with their evidence (links or `file:line`), or none.

## 2. Place

For each friction point, name where the lesson belongs and the proposed wording:

| Lesson | Belongs in |
| --- | --- |
| An agent skipped or misread a step, or a rule would hold in any project | The skill that owns that phase |
| A rule only this project needs was missing (its paths, commands, tools, product rules) | The project's agent rules (`AGENTS.md` or equivalent) |
| A scope, protection or merge rule misfired | `.github/lanes.json` |
| An issue arrived unbuildable | The issue template, or the `spec` checks |
| Users or developers lacked information | Application docs or assets |

A project's agent rules and workflow doc hold only the project's own values and link the skill for each step. When one of them, or an agent's saved memory, restates or contradicts a skill, the same lesson replaces that text with a link to the skill.

Keep only lessons that change future behavior. Before writing it, scrub secrets, internal hostnames, client names and local paths.

**Exit gate:** each lesson has one target file and its proposed change.

## 3. Record

Post the lessons as one comment on the shipped issue headed `## Lessons` ("no lessons" when there are none), each with its target file and proposed wording. Lessons from a run's own friction, with no shipped issue to hold them, go in the run's output.

**Exit gate:** the `## Lessons` comment link, or the lessons in the output.

## 4. Propose

Each lesson becomes an issue and a PR, except one that targets `.github/lanes.json` (hand the owner the exact line; in an attended session outside bypass mode the edit itself goes to the owner for approval), needs a product or design decision, or matches an open issue or PR (link that one). For each of the rest:

1. Invoke `spec` (phase 1) with the target repository (`-R <owner/repo>` for an upstream skill library) to open an issue carrying the target file and the wording.
2. Make a worktree of the target repository from its fetched base branch, on branch `<branchPrefix>lesson-<N>-<slug>` (`<branchPrefix>` from the target's lanes.json, default `agent/afk-`); for another repository, clone it into the host's temporary directory instead. Apply the wording and pass the target's verification gate.
3. Push, then open it through board.md's Open PR step, its body also linking the `## Lessons` comment.
4. When the owner approved the `## Lessons` wording in this session and `triage` hands a lesson PR to the owner, run `python3 "<the afk skill's directory>/scripts/lanes.py" merge <pr> --owner-approved` for it; the host asks the owner to confirm each one.
5. Link the issue and the PR from the `## Lessons` comment (or the run's output), and remove a temporary clone.

**Exit gate:** the `## Lessons` comment (or the run's output) linking an issue and a PR for each lesson, or naming why it stays a proposal.

## Output

In [board.md](../../references/board.md)'s Reporting to the owner form. Summary, one line per lesson: target file, the change in a few words and its PR, or why it stays a proposal; or "no lessons".
