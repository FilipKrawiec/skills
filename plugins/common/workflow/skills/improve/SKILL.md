---
name: improve
description: Use when a change has shipped (07 Improve) or friction, rework or a repeated review finding should become a lasting change to skills, agent rules or docs.
allowed-tools: Skill Read Edit Write Bash(gh:*,git:*,python3:*,just:*)
---

# Improve (07)

## 1. Collect

For each issue awaiting lessons (closed as completed in the last 30 days, its newest `## Shipped` comment newer than any `## Lessons`) and for this session, list parks, failed fixes, review findings, red base, owner corrections (agent memory too) including challenged decision records, which mark a recommendation that was wrong, missing commands or docs, and rules that cost time without preventing a failure. Find earlier occurrences in past `## Lessons` comments.

**Exit gate:** friction points with evidence and earlier occurrences, or none.

## 2. Place

- A lesson needs two linked occurrences or the owner's request; one occurrence is an observation only.
- Prefer an existing deterministic gate, then delete or sharpen a rule. Add a helper only for a demonstrated boundary existing tools cannot enforce; do not build a workflow engine here.
- One target per lesson: the skill owning the phase (rules holding in any project); project agent rules (project-only); `.github/lanes.json` or `.github/CODEOWNERS` (scope, merge, owner paths); the issue template or `spec` (unbuildable issues); docs. Never agent memory.
- Scrub secrets, internal hostnames, client names and local paths.

**Exit gate:** each lesson has a target file and wording.

## 3. Record

Comment `## Lessons` on the shipped issue ("no lessons" when none): lessons with occurrences, target and wording; observations one line each. No shipped issue: use the output.

**Exit gate:** the comment link, or the output.

## 4. Propose

Classify by effects: routine engineering guidance within approved constraints is delegated; product intent, cost, owner paths, credential/merge authority and production approval remain reserved. A documentation label never makes an authority change routine. Keep configuration/CODEOWNERS changes for explicit owner authority. Link duplicate proposals.

The orchestrator assigns bounded implementation and delivery to workers through the harness's native subagents. Workers load the owning skill, perform one phase and return evidence; they do not dispatch or advance phases. `agent-review` owns GitHub approval. Serialize unless native coordination and disjoint scopes, including tests and dependencies, are proven.

```text
Intent: <lesson, occurrences, milestone/issue and desired effect>.
Criteria: <exact wording/outcomes and authoring budgets>.
Scope: <owned paths including tests; exclusions; dependencies>.
Checkout: <worktree>; base <ref/SHA>; head <branch/SHA>.
Decisions: <delegated engineering choices; owner-reserved effects>.
Evidence: <lessons links, prior decisions, commands/exits, findings>.
Perform only assigned authoring or VCS work using its owning skill; no
worker dispatch or orchestration. Preserve other edits. Independent review
must judge a fresh exact head; Craftsman cannot approve. Return changed paths,
head, checks/exits, exit gate and remaining decisions in at most 8 lines.
```

Use one issue/ready PR per target repository; link the Lessons evidence. Verify the target, secure independent exact-head review and enable auto-merge awaiting required approvals/checks. On failure, diagnose and attempt at most two fixes, then record replan/wait with retry condition; retain the lane. Ask the owner only for reserved effects.

**Exit gate:** each lesson linked to its PR, or a proposal with its reason.

## Output

≤ 8 lines. **Summary:** each lesson PR with targets and change, or "no lessons" and the observation count. **Decision:** proposals left, with target, reason and a recommendation, or the next action and responsible actor. Use "Nothing needed" only with no pending action.
