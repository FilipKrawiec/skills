---
name: refine
description: Use when reviewing and refining a backlog, todo list or project board, or running a recurring backlog refinement routine.
allowed-tools: Skill Read Edit Bash(gh:*,git:*)
---

# Backlog Refinement

Refine the queue across items. Invoke `spec` for individual intent, criteria, estimate, scope and lane. Approved milestone intent authorizes autonomous slicing, refinement and lane assignment without per-story approval. Validate owner-authored GitHub approval of the matching brief revision; silence grants nothing. Have the host invoke `milestone` separately for missing authority.

## 1. Inventory

- Resolve the source from the request; never substitute another repository's backlog.
- Read project rules, workflow settings, CODEOWNERS and the board's actual fields. Fetch all in-scope items, decisions, relationships and active work; paginate fully. Report inaccessible sources; an empty search never proves an empty backlog.
- Read base code and tests; distinguish evidence from reports.
- Include unclaimed, unrefined bug reports in `lane:proposed` or no lane.

**Exit gate:** every in-scope item is inventoried, or missing coverage is named.

## 2. Reconcile

For each item, take the first matching case:

1. A linked PR or active claim is still in progress: preserve its execution state and flag acceptance changes to its implementer.
2. Implementation evidence meets every criterion: link evidence per criterion and propose closure; leave closing to the owner through `spec`.
3. Another item owns the same outcome: name the canonical owner and narrow overlapping criteria; preserve unique remaining work. Never close duplicates without the owner's word.
4. A recorded owner decision supersedes the body: put the binding decision and its source in the body; update dependent slices and epic summaries together.
5. Remaining work is unclear or too large (code over lanes.json `ownerLines`, default 800): invoke `spec` to ground and refine it into vertical slices within it.

- Historical bot recommendations are not owner approval; out-of-intent proposals never halt approved work.
- Lanes say whether owner participation is required; milestones group deliverables: give each open issue a milestone (a slice its epic's) and drop epics' lanes; defer work, including work awaiting a third party, to a later milestone, keeping its lane.
- Independently adjudicate technical choices and ADRs; reserve product/strategy reversal, new paid services or budget increases, and authority/credential/release/quality-gate weakening for the owner. New interactions require owner prototype direction. Bounded investigations may proceed with a question, time limit and evidence exit.
- Trace dependencies through open and closed items. Remove a prerequisite only when its responsibility is gone. Detect cycles, missing prerequisites and shared-file races. Record merge order and shared-file ownership as blocked-by links, never only in comments; drop links to deferred work. Unattended, add links mirroring a packet or `### Dependencies` section; report removals instead.
- Check the scope packet covers every criterion, including tests, locales and required documentation; account for project-wide allowances. Record protected paths and owner actions visibly. If the base deleted a packet path, confirm the outcome still holds before asking.

**Exit gate:** each item has a disposition and each cross-item conflict has a correction or a visible blocker.

## 3. Apply

- A review-only request produces recommendations; a refinement request authorizes issue and board edits in scope, never implementation, new milestone authority, merges, releases or deployments. Standing milestone approval covers in-intent story lanes.
- For GitHub issues, invoke `spec` for specification and readiness changes. Within approved milestone intent, refine and slice autonomously; otherwise report proposals. Edit other sources directly, using their own readiness convention. Preserve owner approvals; a board column never grants unattended authority.
- Take and record routine recommendations. If independent adjudication is needed, ask the host to dispatch a leaf worker with: "Decide #<N>: <question>; options <A/B>; recommend <A> from <evidence>. Read <rules, criteria, code, constraints>; no dispatch or credential access. Return decision, evidence and reserved owner question if any in ≤ 5 lines." Keep refining independent work. Preserve lane authorization through temporary blockers; `lane:owner` only when owner participation is required.
- Re-read each item before writing. Patch minimally; no comment per formatting change.
- Derive board status from readiness, dependencies and active work. Preserve priorities unless a recorded decision or parent policy changes them.

**Exit gate:** authorized corrections are saved; pending choices remain visible and blocked work cannot appear ready.

## 4. Verify and Report

Re-fetch changed items and cards. Confirm saved criteria, scope, dependencies, lanes and status; check the blocked-by graph for cycles and for links the bodies don't name. List the parallel set: Todo issues with no open blocker and disjoint packets. Account for every item; label old evidence.

Recurring runs leave unchanged items alone; flag blockers and owner waits. Schedule only when asked.

**Exit gate:** saved changes match the refinement; coverage gaps and choices are reported.

**Output:** ≤ 8 lines, with **Summary** (counts, changed-item/project links, corrections, verification and coverage limits) and **Decision** (owner choices with options and a recommendation, or "Nothing needed.").

```text
Summary: Refined #14 and #18; packets disjoint; #20 waits on #14.
Decision: Nothing needed.
```
