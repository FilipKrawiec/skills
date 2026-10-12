---
name: refine
description: Use when reviewing and refining a backlog, todo list or project board, or running a recurring backlog refinement routine.
allowed-tools: Skill Read Edit Bash(gh:*,git:*)
---

# Backlog Refinement

Refine the queue across items. For GitHub issues, invoke `spec` for individual intent, criteria, estimate, scope and lane. A later owner decision can supersede an item body.

## 1. Inventory

- Resolve the source from the request; ask once if ambiguous, never substitute another repository's backlog.
- Read project rules, workflow settings, CODEOWNERS and the board's actual fields. Fetch all in-scope items, decisions, relationships and active work; paginate to completion. Check board drift across draft and closed cards. Report inaccessible sources; an empty search never proves an empty backlog.
- Read the base's code and tests; separate source evidence from historical reports and unverified claims.
- Also fetch open bug reports (`type:bug` or `<!-- explore-finding`) lacking `<!-- refined base=`; read [bug-reports.md](references/bug-reports.md) when any exist.

**Exit gate:** every in-scope item is inventoried, or missing coverage is named.

## 2. Reconcile

For each item, take the first matching case:

1. A linked PR or active claim is still in progress: preserve its execution state and flag acceptance changes to its implementer through the authorized workflow.
2. Implementation evidence meets every criterion: link evidence per criterion and propose closure; leave closing to the owner through `spec`.
3. Another item owns the same outcome: name the canonical owner and narrow overlapping criteria; preserve unique remaining work. Do not close duplicates without the owner's instruction.
4. A recorded owner decision supersedes the body: put the binding decision and its source in the body; update dependent slices and epic summaries together.
5. Remaining work is unclear or too large: invoke `spec` to ground and refine it, splitting valuable vertical slices when several PRs are needed.

- Read comments before repeating a question. Historical bot recommendations are not owner approval.
- Trace dependencies through open and closed items. Remove obsolete prerequisites only when their responsibility is gone; retain completed prerequisite evidence. Detect cycles, missing prerequisites and shared-file races. Record merge order and shared-file ownership as blocked-by links, never only in comments or the report; drop links to deferred work. Unattended, add links mirroring a packet or `### Dependencies` section; report removals instead.
- Separate first-delivery criteria from explicitly deferred work. An epic's old summary must not reintroduce a deferred slice as a gate.
- Check the scope packet covers every criterion, including tests, locales, model changes and required documentation; account for project-wide allowances. An empty packet cannot authorize edits. Record protected paths and owner actions visibly. Check whether the base deleted a packet path; if so, confirm the outcome still holds before asking the owner.

**Exit gate:** each item has a disposition and each cross-item conflict has a correction or a visible blocker.

## 3. Apply

- A review-only request produces recommendations; a refinement request authorizes issue and board edits in scope, never implementation, new unattended approvals, merges, releases or deployments.
- For GitHub issues, invoke `spec` for specification and readiness changes. Unattended, run only its triage phase and report proposed specification changes; its attended phases remain attended. For other sources, edit the source directly with an outcome, checkable completion criteria, dependencies and blockers; use its existing readiness convention, not GitHub labels. Preserve owner approvals; a board column never grants unattended authority.
- Take routine recommendations and record them; ask the owner only what `spec` reserves for them, refining independent items meanwhile.
- Re-read each item before writing; reconcile newer versions. Patch minimally, preserving unrelated content and history; no comment per formatting change.
- Derive board status from readiness, dependencies and active work. Preserve priorities unless a recorded decision or parent policy changes them. Correct stale board descriptions, never columns or automation rules.

**Exit gate:** authorized corrections are saved; pending choices remain visible and blocked work cannot appear ready.

## 4. Verify and Report

Re-fetch changed items and cards. Confirm saved criteria, scope, dependencies, lanes and status; check the blocked-by graph for cycles and for links the bodies don't name. List the parallel set: Todo issues with no open blocker and disjoint packets. Account for every inventoried item. Issue-only edits need no code tests; never present old test evidence as fresh.

Recurring runs leave unchanged items alone, notifying only for meaningful changes or owner action. Schedule the routine only when asked.

**Exit gate:** saved changes match the refinement; coverage gaps and choices are reported.

**Output:** ≤ 8 lines, with **Summary** (counts, changed-item/project links, substantive corrections, verification and coverage limits) and **Decision** (owner choices with options and a recommendation, or "Nothing needed.").

```text
Summary: Reviewed 12 items; refined 4, left 6 unchanged, and blocked 2.
Project: <URL>; corrected scope in #14 and carried the owner decision into #18.
Parallel now: #14, #18 (disjoint packets); #20 waits on #14.
Verification: re-read 4 bodies and 2 cards; no blocked-by cycles. Code tests not run.
Decision: #22 needs a sharing choice; recommend a private personal workspace.
```
