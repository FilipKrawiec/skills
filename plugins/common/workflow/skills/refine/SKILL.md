---
name: refine
description: Use when reviewing and refining a backlog, todo list or project board, or running a recurring backlog refinement routine.
allowed-tools: Skill Read Edit Bash(gh:*,git:*)
---

# Backlog Refinement

Refine only the requested queue. Invoke `spec` for issue criteria, scope and transition semantics; the named actor applies each transition and the orchestrator moves board status. A direct owner request or matching approved milestone is authority; silence, labels and bot summaries are not. A review-only request produces recommendations; refinement authorizes scoped issue and board edits, not implementation, merges or releases.

## 1. Inventory

Read the requested source, project rules, workflow settings, board fields, decisions, dependencies, active work and relevant base code/tests. Paginate the in-scope queue completely; report inaccessible or missing coverage. Include unclaimed unrefined proposed or unlabelled bugs. Never substitute another repository's backlog.

**Exit gate:** in-scope items and evidence inventoried, or gaps named.

## 2. Reconcile

For each item, apply the first matching case:

1. Active claim or linked PR: preserve execution state and tell its implementer about acceptance changes.
2. Criteria already met: link evidence and use `spec` to close routine work within authority; deployment acceptance remains separate.
3. Overlapping outcome: identify its canonical issue and preserve unique work; never close duplicates without owner authority.
4. Owner decision supersedes the body: record the binding decision and update dependent slices and epic summaries.
5. Unclear or oversized work: use `spec` to ground and split into independently verifiable outcomes. Decide the lane from the nature of the remaining change and required owner participation; line counts never determine authority.

Give open issues a milestone, slices their epic's milestone, and epics no lane. Preserve required work and its lane when waiting. Trace outcome dependencies across open and closed items; record them as blocked-by links, detect cycles and missing prerequisites, and remove ordering links based solely on shared files or integration. Unattended, add links supported by the packet or dependency section; report removals instead. Check scope covers criteria, tests, locales and required docs, including project-wide allowances; record protected paths and owner actions.

Delegate routine technical decisions; reserve product strategy, new costs, authority and quality-gate weakening for the owner. New interactions need owner prototype direction. Continue independent work while a reserved decision waits.

**Exit gate:** each item has a disposition and unresolved conflicts have an owner and wait.

## 3. Apply and verify

Re-read before editing; patch minimally and preserve existing approvals, priorities and active claims. Use `spec` for issue readiness and transition semantics; the named actor applies transitions; update other sources by their conventions. Derive board status from readiness, dependencies and work, never from authorization alone. Re-fetch changes and verify criteria, scope, lanes, dependencies, board status and absence of dependency cycles; report uncovered items and the parallel Todo set. Recurring runs preserve unchanged items; schedule only when asked.

**Exit gate:** authorized corrections verified and blocked work cannot appear ready.

## Output

At most 8 lines: **Summary:** counts, changed links, corrections, checks and coverage gaps. **Decision:** next action/actor or reserved options and recommendation.
