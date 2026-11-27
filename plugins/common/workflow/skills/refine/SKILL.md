---
name: refine
description: Use when the owner asks to review and refine a backlog, todo list or project board.
allowed-tools: Skill Read Edit Bash(gh:*,git:*)
---

# Backlog Refinement

Refine only the requested queue. Invoke `spec` for issue criteria, scope and transition semantics; the named actor applies each transition and moves its board status. A direct owner request or matching approved milestone is authority; silence, labels and bot summaries are not. A review-only request produces recommendations; refinement authorizes scoped issue and board edits, not implementation, merges or releases.

## 1. Inventory

Read the requested source, project rules, workflow settings, board fields, decisions, dependencies, active work and relevant base code/tests. Paginate the in-scope queue completely; report inaccessible or missing coverage. Include unstarted, unrefined bugs, and open PRs: an orphan PR (its body has no `Closes #N` or `Part of #N`, bot dependency updates included) gets an issue through `spec`, under its epic, and its body links it. Never substitute another repository's backlog.

**Exit gate:** in-scope items and evidence inventoried, or gaps named.

## 2. Reconcile

For each item, apply the first matching case:

1. `state:started` or a linked PR: preserve execution state and tell its implementer about acceptance changes.
2. Criteria already met: link evidence and use `spec` to close routine work within authority; deployment acceptance remains separate.
3. Related compatible work: group small fixes, implementation, tests and docs into one bounded, independently reviewable outcome to reduce repeated agent, review and coordination costs. Consolidate unstarted issues into a canonical issue without asking the owner: carry over every outcome, criterion, dependency, decision, milestone and relevant status; close the originals as not planned with `<!-- workflow:consolidated-into N -->` appended to their bodies, so a dependency on one follows N, and record their disposition. `drive` sends overlapping unstarted issues to the planner before it starts one. Never close a started or `lane:owner` issue as a duplicate without owner authority; never merge issues with an open PR or in different epics without a shared outcome; preserve active claims and separate work with incompatible authority or delivery constraints.
4. Owner decision supersedes the body: record the binding decision and update dependent slices; invoke `spec` to update the epic body.
5. Unclear work: use `spec` to ground it. Split related work only for a concrete independent outcome, meaningful dependency, authority boundary or delivery constraint; avoid process-only refinement tickets and nesting without an outcome. Set `lane:owner` only when the remaining change needs the owner's participation; line counts never determine authority.

Give open issues a milestone, slices their epic's milestone, and approved epics no `lane:owner`; a draft epic keeps `lane:owner` until the owner answers its open questions. Before keeping a recorded wait, re-read its retry condition against current evidence (runs, PRs, merges); when met, act on it. Preserve required work and its `lane:owner` while a wait stands. Trace outcome dependencies across open and closed items; record them as blocked-by links, detect cycles and missing prerequisites, and remove ordering links based solely on shared files or integration (`issue edit --number N --unblock M`, and `--no-parent P` for a wrong sub-issue link; never `gh api`). Check scope covers criteria, tests, locales and required docs, including project-wide allowances; record protected paths and owner actions.

The team manages the backlog; the owner manages outcomes at epic level only. Never ask the owner to consolidate, close, split, order or slice unstarted issues. Delegate routine technical decisions; reserve product strategy, new costs, authority and quality-gate weakening for the owner. New interactions need owner prototype direction. Continue independent work while a reserved decision waits.

Blocked means a person must act; the owner reads every Blocked card as a problem. Clear Blocked cards first: remove the blocker (packet, split or routine decision), then move the card to Todo. A wait on another issue or an open PR is not a blocker: record it as a blocked-by link and move the card to Todo; `drive` starts it only once the blocker closes. Leave a card Blocked only for what a person must do, and comment what. `lane:owner` is only for owner-reserved decisions.

**Exit gate:** each item has a disposition and unresolved conflicts have an owner and a wait with no met retry condition.

## 3. Apply and verify

Re-read before editing; patch minimally and preserve existing approvals, priorities and `state:started`. Use `spec` for issue readiness and transition semantics; the named actor applies transitions; update other sources by their conventions. Derive board status from readiness, dependencies and work, never from authorization alone. Re-fetch changes and verify criteria, scope, labels, dependencies, board status and absence of dependency cycles; report uncovered items and the parallel Todo set. Leave unchanged items untouched.

**Exit gate:** authorized corrections verified and blocked work cannot appear ready.

## Output

At most 8 lines: **Summary:** counts, changed links, corrections, checks and coverage gaps. **Decision:** next action/actor or reserved options and recommendation.
