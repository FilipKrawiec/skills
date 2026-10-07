---
name: improve
description: Use when a change has shipped (07 Improve) or friction, rework or a repeated review finding should become a lasting change to skills, agent rules or docs.
allowed-tools: Skill Read Edit Write Bash(gh:*,git:*,python3:*,just:*)
---

# Improve (07)

Remove friction at its source instead of relying on anyone's memory, changing a rule only when a failure repeats. Each change lands as a PR the owner can close to reject it.

**With the owner:** every phase; the owner may drop a lesson before phase 4. **Unattended:** every phase; the owner decides on each lesson's PR later.

## 1. Collect

For the shipped issue (07 Improve in [board.md](../../references/board.md)'s States) or the current session, gather what slowed the cycle or caused rework: parks, failed fix attempts, review findings, red pipelines after merge, owner corrections (including ones an agent saved to its own memory), missing commands or docs, and rules that slowed the cycle without preventing a failure. Search earlier `## Lessons` comments (`gh search issues "## Lessons" -R <owner/repo>`) for each one.

**Exit gate:** a list of friction points, each with its evidence (links or `file:line`) and any earlier occurrence, or none.

## 2. Place

A friction point becomes a lesson only with two linked occurrences (issues, PRs, runs or review findings) or on the owner's request; a single one is recorded in phase 3 as an observation and changes nothing. Prefer, in order: a script or gate that makes the failure impossible, an edit or deletion of an existing rule, a new rule. Name each lesson's one target and the proposed wording:

| Lesson | Belongs in |
| --- | --- |
| An agent skipped or misread a step, or a rule would hold in any project | The skill that owns that phase |
| A rule only this project needs was missing (its paths, commands, tools, product rules) | The project's agent rules |
| A scope, protection or merge rule misfired | `.github/lanes.json` |
| An issue arrived unbuildable | The issue template, or the `spec` checks |
| Users or developers lacked information | Application docs or assets |
| A rule cost more than it prevented | Delete it where it lives |

A project's agent rules and workflow doc hold only the project's own values and link the skill for each step; when one of them, or an agent's saved memory, restates or contradicts a skill, the lesson replaces that text with a link to the skill. Scrub secrets, internal hostnames, client names and local paths from the wording.

**Exit gate:** each lesson has one target file and its proposed change.

## 3. Record

Post one comment on the shipped issue headed `## Lessons` ("no lessons" when there are none): each lesson with its occurrences, target file and wording, then each observation in one line. Lessons with no shipped issue to hold them go in the run's output.

**Exit gate:** the `## Lessons` comment link, or the lessons in the output.

## 4. Propose

The lessons for one target repository become one issue and one PR, leaving out each lesson that targets `.github/lanes.json` (hand the owner the exact line), needs a product or design decision, or matches an open issue or PR (link that one). For each target repository:

1. Invoke `spec` (phase 1) with the target repository (`-R <owner/repo>` for an upstream skill library) to open an issue carrying each lesson's target file and wording.
2. Make a worktree of the target repository from its fetched base branch, on `<branchPrefix>lesson-<N>-<slug>` (`<branchPrefix>` from the target's lanes.json, default `agent/afk-`); for another repository, clone it into the host's temporary directory instead. Apply the wordings and pass the target's verification gate.
3. Push, then open it through board.md's Open PR step, its body also linking the `## Lessons` comment.
4. When the owner approved the `## Lessons` wording in this session and `triage` hands the PR to the owner, run `python3 "<the afk skill's directory>/scripts/lanes.py" merge <pr> --owner-approved`; the host asks the owner to confirm each one.
5. Link the issue and the PR from the `## Lessons` comment (or the run's output), and remove a temporary clone.

**Exit gate:** the `## Lessons` comment (or the run's output) linking the issue and PR that carry each lesson, or naming why it stays a proposal.

## Output

In board.md's Reporting to the owner form. Summary, one line per lesson PR: target files, the change in a few words and its PR; or "no lessons" with the count of observations. Decision: each lesson that stays a proposal, with its target file and why.
