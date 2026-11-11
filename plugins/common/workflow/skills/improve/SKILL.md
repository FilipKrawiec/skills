---
name: improve
description: Use when an epic is delivered, when its review Nits need sweeping, or when friction, rework or a review finding should become a lasting change to skills, agent rules or docs.
allowed-tools: Skill Read Edit Write Bash(gh:*,git:*,just:*,node:*)
---

# Improve

## 1. Find the lesson

Run once per delivered epic, never per PR, and sweep its Nits in the same run. Read the epic's merged PRs: review threads, fix rounds, verdicts and pipeline runs; an epic already carrying `## Lessons` is done, and step 3 writes that comment last. Run `<cli> nits` (`<cli>` is `node <this-skill-directory>/../../scripts/workflow.mjs`) for the Reviewer's unswept Nits on recently merged PRs, grouped by file; a Nit repeated across PRs is an occurrence like any other. For an owner-requested improvement, inspect the named event and relevant prior evidence; do not sweep unrelated issues. Find repeated failures, owner corrections, missing signals and rules that cost time or tokens without preventing failure.

A lesson needs two linked occurrences or the owner's request. A revert or fix-forward needs only one: name the earliest `spec`, `tdd`, `review` or CI signal that should have caught it. A single other occurrence is an observation.

**Exit gate:** scoped lessons, evidence and the Nits listed, or observations only.

## 2. Fix the cause

Prefer an existing deterministic gate; otherwise delete or sharpen the owning rule. Add a helper only for a demonstrated boundary existing tools cannot enforce. Choose one target per lesson: the phase skill for general rules, project rules for local ones, scope configuration for authority, or the issue template for unbuildable issues. A lesson about a skill or the workflow CLI becomes a follow-up issue in the skills' origin repository, never agent memory or a local edit: comment evidence on an open match, like an `issue create --check` overlap; otherwise `issue create --repo <origin>` a routine `type:bug`/`type:chore` via `spec`. A CLI refusal is owner-reserved: comment it on the issue `issue create --unique --title "Owner improvements" --labels type:task,lane:owner --body-file PATH` returns. Scrub secrets, internal hostnames, client names and local paths.

Routine engineering within approved constraints is delegated. Product intent, cost, owner paths, credential or merge authority, production approval and configuration/CODEOWNERS changes remain reserved. A documentation label does not change authority. Link duplicate proposals.

**Exit gate:** target and change or a named reserved decision.

## 3. Deliver and record

Make an explicitly requested small change in place when repository rules allow. Fix the Nits worth fixing in one change with the lessons, or file them as one follow-up issue; then run `<cli> nits --done <PR>...` for every PR swept. Deliver a change like any other: file its issue and run `drive <issue>`. On failure, attempt at most two evidence-led fixes, then record a concrete retry condition. Ask the owner only for reserved effects.

On the epic, after filing, comment `## Lessons` with occurrences, target and wording, or `no lessons`, plus the swept Nits; list observations in one line each. With no epic, report these in the output.

**Exit gate:** reviewed change or linked PR, observation, or proposal with a named blocker.

## Output

At most 8 lines: **Summary:** change or observations and evidence. **Decision:** next action/actor or reserved options and recommendation. Use “Nothing needed” only with no pending action.
