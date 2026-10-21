---
name: refine
description: Use when reviewing and refining a backlog, todo list or project board, or running a recurring backlog refinement routine.
allowed-tools: Skill Read Edit Bash(gh:*,git:*)
---

# Backlog Refinement

Invoke `spec` for individual intent, criteria, estimate, scope and lane. Use a trusted direct owner request or matching approved milestone brief as authority; record its source on GitHub for durable work. Refine authorized slices without per-story approval. Silence and bot summaries grant nothing; missing milestone direction goes to the host.

## 1. Inventory

- Resolve the source from the request; never substitute another repository's backlog.
- Read project rules, workflow settings, CODEOWNERS and the board's actual fields. Fetch in-scope items, decisions, relationships and active work; paginate fully. Report inaccessible sources; an empty search never proves an empty backlog.
- Read base code/tests; distinguish evidence from reports.
- Include unclaimed, unrefined bug reports in `lane:proposed` or no lane.

**Exit gate:** every in-scope item is inventoried, or missing coverage is named.

## 2. Reconcile

For each item, take the first matching case:

1. A linked PR or active claim is still in progress: preserve its execution state and flag acceptance changes to its implementer.
2. Implementation evidence meets every criterion: link evidence per criterion; invoke `spec` to close completed routine work within authority. Keep deployment acceptance separate.
3. Another item owns the same outcome: name the canonical owner and narrow overlapping criteria; preserve unique remaining work. Never close duplicates without the owner's word.
4. A recorded owner decision supersedes the body: put the binding decision and its source in the body; update dependent slices and epic summaries together.
5. Remaining work is unclear or too large (code over lanes.json `ownerLines`, default 800; docs, tests, manifests and lockfiles don't count): invoke `spec` to ground and refine it into vertical slices within it.

- Out-of-intent proposals never halt approved work.
- Lanes say whether owner participation is required; milestones group deliverables: give each open issue a milestone (a slice its epic's) and a parent epic; drop epics' lanes; order epics on the board in delivery order; defer only work outside the current acceptance; required work stays in its milestone with a visible wait, keeping its lane.
- Independently adjudicate technical choices and ADRs; reserve product/strategy reversal, new paid services or budget increases, and authority/credential/release/quality-gate weakening for the owner. New interactions require owner prototype direction. Bounded investigations may proceed with a question, time limit and evidence exit.
- Trace dependencies through open and closed items. Remove a prerequisite only when its responsibility is gone. Detect cycles, missing prerequisites and shared-file races. Record merge order and shared-file ownership as blocked-by links, never only in comments; keep deferred prerequisites blocking until fulfilled or genuinely removed from scope. Unattended, add links mirroring a packet or `### Dependencies` section; report removals instead.
- Check the scope packet covers every criterion, including tests, locales and required documentation; account for project-wide allowances. Record protected paths and owner actions visibly. If the base deleted a packet path, confirm the outcome still holds before asking.

**Exit gate:** each item has a disposition and each cross-item conflict has a correction or a visible blocker.

## 3. Apply

- A review-only request produces recommendations; a refinement request authorizes issue and board edits in scope, never implementation, new milestone authority, merges, releases or deployments.
- For GitHub issues, invoke `spec` for specification and readiness changes. Refine and slice within recorded authority; otherwise report proposals. Edit other sources directly, using their own readiness convention. Preserve owner approvals; a board column never grants unattended authority.
- Take and record routine recommendations. For independent adjudication, send the orchestrator a bounded request: repository/issue; question/options and recommendation/evidence; applicable rules, criteria, code and constraints; bound, dependencies and reserved owner question. Do not dispatch or brief another worker. The orchestrator decides and fills `milestone`'s complete brief. Keep refining independent work. Preserve lane authorization through temporary blockers; `lane:owner` only when owner participation is required.
- Re-read each item before writing. Patch minimally; no comment per formatting change.
- Derive board status from readiness, dependencies and active work. Preserve priorities unless a recorded decision or parent policy changes them.

**Exit gate:** authorized corrections are saved; pending choices remain visible and blocked work cannot appear ready.

## 4. Verify and Report

Re-fetch changed items and cards. Confirm saved criteria, scope, dependencies, lanes and status; check the blocked-by graph for cycles and for links the bodies don't name. List the parallel set: Todo issues with no open blocker and disjoint packets. Account for every item; label old evidence.

Recurring runs preserve unchanged items; flag waits. Schedule only when asked.

**Exit gate:** saved changes match the refinement; coverage gaps and choices are reported.

**Output:** ≤ 8 lines, with **Summary** (counts, changed-item/project links, corrections, verification and coverage limits) and **Decision** (next action/actor, or reserved owner choices with options and recommendation).

```text
Summary: Refined #14 and #18; packets disjoint; #20 waits on #14.
Decision: Orchestrator selects #18; Product partner rechecks #20 after #14 delivers.
```
