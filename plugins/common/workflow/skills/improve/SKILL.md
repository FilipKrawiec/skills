---
name: improve
description: Use when a change has shipped or when friction, rework or a review finding should become a lasting change to skills, agent rules or docs.
allowed-tools: Skill Read Edit Write Bash(gh:*,git:*,just:*,node:*)
---

# Improve

## 1. Find the lesson

For a merged PR, read its review threads, fix rounds, verdicts, pipeline runs and the runs' `Usage:` lines; a PR already carrying `## Lessons` is done, and step 3 writes that comment last. For an owner-requested improvement, inspect the named event and relevant prior evidence; do not sweep unrelated issues. For a scheduled batch, inspect issues closed as completed in the last 30 days whose newest `## Shipped` comment is newer than any `## Lessons`. Also read that window's `Usage:` lines the AFK watcher adds to released holds. Find repeated failures, owner corrections, missing signals and rules that cost time or tokens without preventing failure; a run whose usage far exceeds comparable runs is an observation.

A lesson needs two linked occurrences or the owner's request. A revert or fix-forward needs only one: name the earliest `spec`, `tdd`, `review` or CI signal that should have caught it. A single other occurrence is an observation.

**Exit gate:** scoped lessons and evidence, or observations only.

## 2. Fix the cause

Prefer an existing deterministic gate; otherwise delete or sharpen the owning rule. Add a helper only for a demonstrated boundary existing tools cannot enforce. Choose one target per lesson: the phase skill for general rules, project rules for local ones, scope configuration for authority, or the issue template for unbuildable issues. A lesson about a skill or the workflow CLI becomes a follow-up issue in the skills' origin repository, never agent memory or a local edit: comment evidence on an open match, like an `issue create --check` overlap; otherwise `issue create --retro --repo <origin>` a routine `type:bug`/`type:chore` via `spec`. A CLI refusal is owner-reserved: comment it on the issue `issue create --unique --title "Owner improvements" --labels type:task,lane:owner --body-file PATH` returns. Scrub secrets, internal hostnames, client names and local paths.

Routine engineering within approved constraints is delegated. Product intent, cost, owner paths, credential or merge authority, production approval and configuration/CODEOWNERS changes remain reserved. A documentation label does not change authority. Link duplicate proposals.

**Exit gate:** target and change or a named reserved decision.

## 3. Deliver and record

Make an explicitly requested small change in place when repository rules allow; use workers only when needed for independence or parallel work. Follow repository verification and review requirements. A worker receives minimal fresh context where supported, with this complete brief:

```text
Intent: <lesson, evidence and assigned phase>.
Criteria and scope: <outcome, paths, exclusions and decisions>.
Checkout: <worktree, base/head SHAs and last reviewed SHA>.
Load <skill>; do only the assigned phase. Preserve edits; do not dispatch,
approve your own work or expose credentials. Return paths, head, checks/exits,
findings, exit gate and decisions in at most 8 lines.
```

For a merged PR or shipped issue, after filing, comment `## Lessons` with occurrences, target and wording, or `no lessons`; list observations in one line each. With no shipped issue, report these in the output. For unattended delivery, use one issue/ready PR per target repository and link the evidence. Obtain independent review and use VCS for authorized delivery. On failure, attempt at most two evidence-led fixes, then retain the lane with a concrete retry condition. Ask the owner only for reserved effects.

**Exit gate:** reviewed change or linked PR, observation, or proposal with a named blocker.

## Output

At most 8 lines: **Summary:** change or observations and evidence. **Decision:** next action/actor or reserved options and recommendation. Use “Nothing needed” only with no pending action.
