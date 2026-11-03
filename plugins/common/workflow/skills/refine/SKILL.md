---
name: refine
description: Use when reviewing and refining a backlog, todo list or project board, or running a recurring backlog refinement routine.
allowed-tools: Skill Read Edit Bash(gh:*,git:*)
---

# Backlog Refinement

Refine only the requested queue. Invoke `spec` for issue criteria, scope and transition semantics; the named actor applies each transition and moves its board status. A direct owner request or matching approved milestone is authority; silence, labels and bot summaries are not. A review-only request produces recommendations; refinement authorizes scoped issue and board edits, not implementation, merges or releases.

## 1. Inventory

Read the requested source, project rules, workflow settings, board fields, decisions, dependencies, active work and relevant base code/tests. Paginate the in-scope queue completely; report inaccessible or missing coverage. Include unclaimed unrefined proposed or unlabelled bugs. Never substitute another repository's backlog.

**Exit gate:** in-scope items and evidence inventoried, or gaps named.

## 2. Reconcile

For each item, apply the first matching case:

1. Active claim or linked PR: preserve execution state and tell its implementer about acceptance changes.
2. Criteria already met: link evidence and use `spec` to close routine work within authority; deployment acceptance remains separate.
3. Overlapping outcome: identify its canonical issue and preserve unique work; never close duplicates without owner authority.
4. Owner decision supersedes the body: record the binding decision and update dependent slices; invoke `spec` to update the epic body.
5. Unclear or oversized work: use `spec` to ground and split into independently verifiable outcomes. Decide the lane from the nature of the remaining change and required owner participation; line counts never determine authority.

Give open issues a milestone, slices their epic's milestone, and approved epics no lane; a draft epic keeps `lane:owner` until the owner answers its open questions. Before keeping a recorded wait, re-read its retry condition against current evidence (runs, PRs, merges); when met, act on it. Preserve required work and its lane while a wait stands. Trace outcome dependencies across open and closed items; record them as blocked-by links, detect cycles and missing prerequisites, and remove ordering links based solely on shared files or integration. Unattended, add links supported by the packet or dependency section; report removals instead. Check scope covers criteria, tests, locales and required docs, including project-wide allowances; record protected paths and owner actions.

Delegate routine technical decisions; reserve product strategy, new costs, authority and quality-gate weakening for the owner. New interactions need owner prototype direction. Continue independent work while a reserved decision waits.

Blocked means a person must act; the owner reads every Blocked card as a problem. Clear Blocked cards first: an AFK run stopped there without a PR and its `afk-issue-blocked` comment says why. Remove the blocker (packet, split or routine decision), then move the card to Todo. A wait on another issue or an open PR is not a blocker: record it as a blocked-by link and move the card to Todo, where the watcher holds it until the blocker closes. Leave a card Blocked only for what a person must do, comment what, and the watcher retries it after the next merge. `lane:owner` is only for owner-reserved decisions. For a `lane:proposed` Backlog item, have a fresh-context subagent load `agent-review` for its eligibility, running each `gh` call as `GH_TOKEN=$(gh auth token --user <identities.reviewer>) gh ...` and never printing the token. Only when the Reviewer identity authored the `APPROVED AFK` marker, set `lane:afk` and move the card to Todo.

**Exit gate:** each item has a disposition and unresolved conflicts have an owner and a wait with no met retry condition.

## 3. Apply and verify

Re-read before editing; patch minimally and preserve existing approvals, priorities and active claims. Use `spec` for issue readiness and transition semantics; the named actor applies transitions; update other sources by their conventions. Derive board status from readiness, dependencies and work, never from authorization alone. Re-fetch changes and verify criteria, scope, lanes, dependencies, board status and absence of dependency cycles; report uncovered items and the parallel Todo set. Recurring runs preserve unchanged items; schedule only when asked.

**Exit gate:** authorized corrections verified and blocked work cannot appear ready.

## Output

At most 8 lines: **Summary:** counts, changed links, corrections, checks and coverage gaps. **Decision:** next action/actor or reserved options and recommendation.
