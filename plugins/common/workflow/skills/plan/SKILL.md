---
name: plan
description: Use when an issue needs an implementation plan, when scoring or approving a plan, or when resuming work from a posted plan.
allowed-tools: Read Bash(gh:*,git:*)
---

# Plan

Plan within a direct owner request or approved milestone brief; labels, silence and bot summaries grant no authority. Only this, `spec` and `pair` wait for the developer: clarify intent here, so nothing after approval needs to ask. Slices follow the epic's approved outcome; the owner is asked about epic-level outcomes only, never to agree a slice, a split or a consolidation. Do not implement.

## 1. Read

Read the issue, scope packet, criteria and decisions, and the affected code, tests and agent rules. For an existing plan or PR, inspect its branch, evidence and remaining work; do not rebuild a settled plan. For a plan that moves, renames or merges files, search the whole repository for each old path and name, and give every consumer found (scripts, CI config, dependency tooling, scope/path maps, docs) its own plan step; a plan with none says so.

**Exit gate:** the requested outcome, evidence and constraints are known.

## 2. Write it as a guide

Write the plan for whoever executes it, agent or developer. Each numbered step states:

- **Why:** the criterion or decision it serves.
- **How:** the paths, interfaces, failing test to write first, and command proving it.

One filled step:

```text
3. Reject an expired token.
   Why: criterion "an expired session returns 401, never the cached user".
   How: in src/auth/session.mjs make `readSession` return null when `expiresAt` is past.
   Failing test first: test/auth/session.test.mjs, "an expired session reads as signed out".
   Command: node --test test/auth/session.test.mjs
```

For UI work, feature code composes the project's own component library; a missing primitive is added to the library first, never inline in the feature (no cross-project kit). Aim for one PR per outcome: plan related fixes, implementation, tests and docs as one bounded, reviewable PR when they can ship together, since each PR repeats agent and review costs. Propose a split for a concrete independent outcome, meaningful dependency, authority boundary or delivery constraint, never by size, estimate or layer alone. Avoid process-only refinement tickets and nesting without an outcome. Add risks, decisions with reasons, and manual test steps CI cannot run. Preserve shared interface inputs, outputs, errors and compatibility. Reserve product intent, paid services, budgets, authority, credentials, release or quality gates for the owner; new interactions need owner prototype direction. Return a technical-adjudication question with options, evidence and a recommendation.

Design pass: before slicing an approved epic, drive asks for a design note (no owner step). Post one epic comment whose first line is `<!-- workflow:design-note -->` (`issue comment`): the module map (which bounded contexts or modules change, using the `ddd` and `hexagonal-architecture` skills), for each epic criterion the existing units and design-system parts it reuses (search the whole repository), and what is lifted into a shared home first. The Reviewer gates it with a `workflow:design-gate` verdict; on `changes`, post a revised note as a new comment. Slice only once it is approved; every slice body cites the design note and the units it uses.

When slicing an approved epic, create exactly one final refinement slice with native blocked-by links to every other slice (`issue create --parent <epic> --milestone <name> --blocked-by N,M`, or `issue edit`; never `gh api`). Include the exact body marker `<!-- workflow:epic-refinement -->`. Give it the epic's milestone, a scope packet and these criteria for its implementer brief and review expectations. When invoked only to create this slice, return after these criteria:

- Review the merged whole epic against its Outcome, Decisions and architecture rules. Fix findings in the refinement PR or name them there with reasons. Resolve recorded Nits, aliases, shims and naming clashes, or raise them on owner paths. Fix the epic's own Nits (Reviewer `**Nit**` comments on its merged PRs) here, never in a separate Nit-sweep PR; drive marks those PRs `nits:swept` at closure. With nothing to change, hand back `status: done`, empty `paths` and `body: <file>`.
- Remove dead files, exports, symbols, fixtures and baseline entries left by the epic. Use project configuration for unused-code tooling; baselines shrink, with no new entries. Make no new feature or behavior change; keep the gate green.
- Use project configuration to record before and after times per project gate and CI part; make only measured wins. If a timing source is unavailable or unconfigured, record missing evidence and claim no measured win.
- Assess the epic's delivery flow: blocked and owner steps, rework, review rounds and cost. File at most two improvements, each with its evidence.

**Exit gate:** every step has a why and a how; an epic has its final refinement slice and native blockers.

An interactive plan continues with [approval.md](references/approval.md): score, post and get it approved. A planner started by `drive` stops here.

## Output

At most 5 lines: **Summary:** outcome, score and plan link. **Decision:** approve the plan, or reserved options and recommendation.
