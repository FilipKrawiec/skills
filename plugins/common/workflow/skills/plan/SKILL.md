---
name: plan
description: Use when an issue needs an implementation plan, when scoring or approving a plan, or when resuming work from a posted plan.
allowed-tools: Skill Read Bash(gh:*,git:*)
---

# Plan

Plan within a direct owner request or approved milestone brief; labels, silence and bot summaries grant no authority. This and `spec` are the only phases that wait for the developer: clarify intent here, so nothing after approval needs to ask. Do not implement.

## 1. Read

Read the issue, scope packet, criteria and decisions, and the affected code, tests and agent rules. For an existing plan or PR, inspect its branch, evidence and remaining work; do not rebuild a settled plan. For a plan that moves, renames or merges files, search the whole repository for each old path and name, and give every consumer found (scripts, CI config, dependency tooling, scope/path maps, docs) its own plan step; a plan with none records that the search found none.

**Exit gate:** the requested outcome, evidence and constraints are known.

## 2. Write it as a guide

Write the plan for whoever executes it: a Craftsman subagent or the developer by hand. Each numbered step states:

- **Why:** the criterion or decision it serves.
- **How:** the paths, interfaces, the failing test to write first, and the command proving it.

Plan the whole logical change as one PR, however many steps or lines it takes. Propose a split only at a logical seam: a prerequisite whole and useful on its own, or an outcome the owner asked to deliver separately; never by size, estimate or layer. Add the risks, the decisions taken with their reasons, and the manual test steps CI cannot run. Preserve shared interface inputs, outputs, errors and compatibility. Reserve product intent, paid services, budgets, authority, credentials, release or quality gates for the owner; new interactions need owner prototype direction. Return a technical-adjudication question with options, evidence and a recommendation.

**Exit gate:** every step has a why and a how.

## 3. Score reproducibility

Give the plan alone, with the issue, to two fresh subagents on different models where the host offers them:

```text
Read plan <link> and issue #<N> only; do not edit.
For each step, answer: why does it exist, and how would you do it
(paths, test, command)? Mark a step `guess` where you had to guess either.
Return one line per step: `<step> ok|guess <what you guessed>`.
```

The score is the share of steps both marked `ok` whose answers match the plan. Below 100%, sharpen each guessed step, asking the developer the why or how question it raised when attended, and score again. A plan below 100% after two revisions goes to the owner with the guessed steps.

**Exit gate:** 100% score, recorded with the plan.

## 4. Approve and record

Post one `## Plan` issue comment, or a compact in-chat plan for small direct work, with the steps, decisions, risks, manual test steps and `Reproducibility: 100% (<n> steps, 2 scorers)`. Update that exact comment by ID; never use `--edit-last`.

- **Attended:** the developer approves the scored plan.
- **Unattended:** a 100% score on a `lane:afk` issue is the approval.

After approval the main thread only orchestrates and never edits project files, attended or not. First invoke `vcs` to start the assignment, so the work runs in an isolated worktree and branch, never the main checkout; then brief a Craftsman subagent with `Intent:`, `Plan:` (the plan link), `Criteria and scope:` and `Checkout:` (that worktree path and base SHA) to execute the plan there through `tdd`, deliver the whole change unless it finds a logical seam (then it stops and proposes the split), and return paths, commands and exits; `vcs` opens the draft PR with its risk label, one fresh reviewer agent runs `review`, `pr-fix` fixes, and `ship` hands it off for approval and merge.

**Exit gate:** approved plan linked, or the owner question it waits on.

## Output

At most 5 lines: **Summary:** outcome, score and plan link. **Decision:** approve the plan, or reserved options and recommendation.
