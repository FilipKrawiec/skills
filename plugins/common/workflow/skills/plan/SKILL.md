---
name: plan
description: Use when an issue needs an implementation plan or when resuming work from a posted plan.
allowed-tools: Skill Read Bash(gh:*,git:*)
---

# Plan

Plan within a direct owner request or approved milestone brief; labels, silence and bot summaries grant no authority. Keep temporary blockers in their authorized lane. Do not implement or advance delivery in this phase.

## 1. Read

Read the issue, scope packet, relevant criteria and decisions, and the affected code, tests and rules. For an existing plan or PR, inspect its branch, evidence and remaining work; do not rebuild a settled plan. For a small direct change, limit analysis to affected behavior and constraints.

**Exit gate:** the requested outcome, relevant evidence and constraints are known.

## 2. Decide

Name the outcome, affected paths, observable tests, focused commands, contracts, risks and unresolved decisions. Map each affected criterion to its evidence; preserve shared interface inputs, outputs, errors and compatibility. Delegate routine implementation choices.

Reserve changes to product intent, paid services, budgets, authority, credentials, release or quality gates for the owner. New interactions require owner prototype direction. Continue independent authorized work while a reserved decision waits. Replan on a substantive conflict with intent or constraints, not a routine discovery. Bound investigations by question, time and evidence.

If technical adjudication is needed, return the question, options, evidence, recommendation, constraints and bound to the orchestrator. For release work, plan required review, configured test delivery and exact owner approval of the production artifact and configuration; preserve required health and migration prerequisites.

**Exit gate:** executable steps and tests, with reserved decisions or gaps named.

## 3. Record

Use a compact in-chat plan for direct work; post one `## Plan` issue comment for AFK or work that must survive the session. A durable plan names scope, risks, decisions, steps and verification. Update that exact comment by ID when it changes; never use `--edit-last`. Do not request approval for routine choices within recorded authority.

**Exit gate:** plan available to implementers, with a comment link when durable.

## Output

At most 5 lines: **Summary:** outcome, scope and plan link when posted. **Decision:** next action/actor or reserved options and recommendation.
