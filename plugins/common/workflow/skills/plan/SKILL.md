---
name: plan
description: Use when an issue needs an implementation plan, when scoring or approving a plan, or when resuming work from a posted plan.
allowed-tools: Read Bash(gh:*,git:*)
---

# Plan

Plan within a direct owner request or approved milestone brief; labels, silence and bot summaries grant no authority. This and `spec` are the only phases that wait for the developer: clarify intent here, so nothing after approval needs to ask. Do not implement.

## 1. Read

Read the issue, scope packet, criteria and decisions, and the affected code, tests and agent rules. For an existing plan or PR, inspect its branch, evidence and remaining work; do not rebuild a settled plan. For a plan that moves, renames or merges files, search the whole repository for each old path and name, and give every consumer found (scripts, CI config, dependency tooling, scope/path maps, docs) its own plan step; a plan with none records that the search found none.

**Exit gate:** the requested outcome, evidence and constraints are known.

## 2. Write it as a guide

Write the plan for whoever executes it: the implementer agent or the developer by hand. Each numbered step states:

- **Why:** the criterion or decision it serves.
- **How:** the paths, interfaces, the failing test to write first, and the command proving it.

Plan the whole logical change as one PR, however many steps or lines it takes. Propose a split only at a logical seam: a prerequisite whole and useful on its own, or an outcome the owner asked to deliver separately; never by size, estimate or layer. Add the risks, the decisions taken with their reasons, and the manual test steps CI cannot run. Preserve shared interface inputs, outputs, errors and compatibility. Reserve product intent, paid services, budgets, authority, credentials, release or quality gates for the owner; new interactions need owner prototype direction. Return a technical-adjudication question with options, evidence and a recommendation.

When slicing an approved epic, create exactly one final refinement slice with native blocked-by links to every other slice. Include the exact body marker `<!-- workflow:epic-refinement -->`. Give it the epic's milestone, a scope packet and these criteria for its implementer brief and review expectations:

- Review the merged whole epic against its Outcome, Decisions and architecture rules. Fix findings in the refinement PR or name them there with reasons. Resolve recorded Nits, aliases, shims and naming clashes, or raise them on owner paths.
- Remove dead files, exports, symbols, fixtures and baseline entries left by the epic. Use project configuration for unused-code tooling; baselines shrink, with no new entries. Make no new feature or behavior change; keep the gate green.
- Use project configuration to record before and after times per project gate and CI part; make only measured wins. If a timing source is unavailable or unconfigured, record missing evidence and claim no measured win.

For epic slicing, use only this refinement procedure, then hand back through `spec`'s Slice; skip steps 3–4.

**Exit gate:** every step has a why and a how; an epic has its final refinement slice and native blockers.

## 3. Score reproducibility

Score the plan yourself; start no scorer subagent. Reread it as an agent that has only the plan and the issue: for each step, answer why it exists and how you would do it (paths, test, command), and mark the step `guess` where the plan does not settle either. The score is the share of steps marked `ok`. Below 100%, sharpen each guessed step, asking the developer the why or how question it raised, and score again. A plan below 100% after two revisions goes to the owner with the guessed steps.

**Exit gate:** 100% score, recorded with the plan.

## 4. Approve and record

Post one `## Plan` issue comment, or a compact in-chat plan for small direct work, with the steps, decisions, risks, manual test steps and `Reproducibility: 100% (<n> steps)`. Update that exact comment by ID; never use `--edit-last`.

The developer approves the scored plan.

After approval, delivery runs through `drive <issue>` in the owner's session: it starts the work in an isolated worktree, briefs the implementer with the issue and the plan link, opens the draft PR and runs review. Never edit project files from the planning session.

**Exit gate:** approved plan linked, or the owner question it waits on.

## Output

At most 5 lines: **Summary:** outcome, score and plan link. **Decision:** approve the plan, or reserved options and recommendation.
