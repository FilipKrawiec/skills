---
name: refine
description: Use when reviewing and refining a backlog, todo list or project board, or running a recurring backlog refinement routine.
allowed-tools: Skill Read Edit Bash(gh:*,git:*)
---

# Backlog Refinement

Refine the queue across items. For GitHub issues, invoke `spec` for individual intent, criteria, estimate, scope and lane.

## 1. Inventory

- Resolve the source from the request; never substitute another repository's backlog.
- Read project rules, workflow settings, CODEOWNERS and the board's actual fields. Fetch all in-scope items, decisions, relationships and active work; paginate fully. Check board drift across draft and closed cards. Report inaccessible sources; an empty search never proves an empty backlog.
- Read the base's code and tests; separate source evidence from unverified reports.
- Also fetch unclaimed bug reports (`type:bug`, `<!-- explore-finding`) in `lane:proposed` or no lane without `<!-- refined base=`; `spec` triages each.

**Exit gate:** every in-scope item is inventoried, or missing coverage is named.

## 2. Reconcile

For each item, take the first matching case:

1. A linked PR or active claim is still in progress: preserve its execution state and flag acceptance changes to its implementer.
2. Implementation evidence meets every criterion: link evidence per criterion and propose closure; leave closing to the owner through `spec`.
3. Another item owns the same outcome: name the canonical owner and narrow overlapping criteria; preserve unique remaining work. Never close duplicates without the owner's word.
4. A recorded owner decision supersedes the body: put the binding decision and its source in the body; update dependent slices and epic summaries together.
5. Remaining work is unclear or too large (code over lanes.json `ownerLines`, default 800): invoke `spec` to ground and refine it into vertical slices within it.

- Historical bot recommendations are not owner approval.
- Lanes say who delivers, milestones when: give each open issue a milestone (a slice its epic's) and drop epics' lanes; defer work, including work awaiting a third party, to a later milestone, keeping its lane.
- A `lane:owner` issue held only by a question the reviewer may decide goes to the reviewer (Apply), however old.
- Trace dependencies through open and closed items. Remove a prerequisite only when its responsibility is gone. Detect cycles, missing prerequisites and shared-file races. Record merge order and shared-file ownership as blocked-by links, never only in comments; drop links to deferred work. Unattended, add links mirroring a packet or `### Dependencies` section; report removals instead.
- An epic's old summary never gates on a deferred slice.
- Check the scope packet covers every criterion, including tests, locales and required documentation; account for project-wide allowances. An empty packet cannot authorize edits. Record protected paths and owner actions visibly. If the base deleted a packet path, confirm the outcome still holds before asking.

**Exit gate:** each item has a disposition and each cross-item conflict has a correction or a visible blocker.

## 3. Apply

- A review-only request produces recommendations; a refinement request authorizes issue and board edits in scope, never implementation, new unattended approvals, merges, releases or deployments.
- For GitHub issues, invoke `spec` for specification and readiness changes. Unattended, run only its triage phase and report proposed specification changes. Edit other sources directly, using their own readiness convention. Preserve owner approvals; a board column never grants unattended authority.
- Take and record routine recommendations. With lanes.json `agentReview`, the reviewer decides each fork you would ask the owner: dispatch a fresh worker with "Invoke `agent-review` to decide on #<N>: <question>; options <A>, <B>; recommended <A>: <evidence>."; ask the owner only on its `owner`. Without it, ask the owner only about UX beyond the criteria, cost, or departing from project patterns or best practice. Keep refining meanwhile.
- Re-read each item before writing. Patch minimally; no comment per formatting change.
- Derive board status from readiness, dependencies and active work. Preserve priorities unless a recorded decision or parent policy changes them. Correct stale board descriptions only.

**Exit gate:** authorized corrections are saved; pending choices remain visible and blocked work cannot appear ready.

## 4. Verify and Report

Re-fetch changed items and cards. Confirm saved criteria, scope, dependencies, lanes and status; check the blocked-by graph for cycles and for links the bodies don't name. List the parallel set: Todo issues with no open blocker and disjoint packets. Account for every inventoried item; never present old test evidence as fresh.

Recurring runs leave unchanged items alone; open with `Blocked: <cause>` or `Waiting on <owner>: <what>` and stay flagged when either applies; else archive. Schedule the routine only when asked.

**Exit gate:** saved changes match the refinement; coverage gaps and choices are reported.

**Output:** ≤ 8 lines, with **Summary** (counts, changed-item/project links, corrections, verification and coverage limits) and **Decision** (owner choices with options and a recommendation, or "Nothing needed.").

```text
Summary: Reviewed 12 items; refined 4, left 6 unchanged, and blocked 2.
Parallel now: #14, #18 (disjoint packets); #20 waits on #14.
Decision: #22 needs a sharing choice; recommend a private personal workspace.
```
