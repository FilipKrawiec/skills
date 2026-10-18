---
name: afk
description: Use when a scheduled task or an orchestrating session's brief asks for one unattended AFK run, optionally naming the issue, in a repository with .github/lanes.json. Never for an owner's own interactive work.
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*,lsof:*)
---

# AFK

Deliver one bounded slice of an approved milestone per run. Read `.github/lanes.json` from `origin/<base>` (`base` defaults to `main`); use its branchPrefix, scope, project and claim settings. Never change the main checkout.

The host owns model routing, credential isolation and enforced claims. Serialize work until those capabilities are proven. Parallel work requires enforced disjoint scopes including tests and dependencies; labels and read/write claim checks are not atomic exclusion. Keep invocation depth at most two, without cycles: ask the host to dispatch leaf assignments rather than nesting orchestration skills.

Read [setup.md](references/setup.md) when enabling or scheduling runs; read [github-safety.md](references/github-safety.md) when checking GitHub protections.

## 1. Establish authority

Have the host assign `ship` to observe actual base health, then read the approved milestone, issue criteria, scope packet, dependencies and recorded decisions. Approved milestones authorize routine engineering decisions within those constraints; record the recommended choice. New interactions require the owner's prototype direction before implementation. Reserve new paid services, budget increases, changed product/strategy intent, authority changes and exact production approval for the owner; existing services within explicit budgets are delegated.

Have the host assign milestone, release and bounded health work to their owning skills; do not reproduce their procedures here. Test delivery is automatic within approved constraints; production requires exact owner approval for the candidate and destination.

**Exit gate:** authorized slice and healthy base, or a recorded wait reason.

## 2. Tend owned PRs

Before selecting new work, inspect each owned open PR and its issue. Have the host assign VCS to reconcile head, checks and threads, and implementation to fix confirmed blockers within approved scope. Preserve lane authorization. Apply bounded diagnosis/replanning from phase 5; keep a visible wait and retry condition if unresolved. Existing PRs stay in this recovery loop instead of being abandoned by candidate filtering.

**Exit gate:** owned PRs ready or recorded for recovery/wait; exact heads and next actions known.

## 3. Select and claim

Choose an open `lane:afk` issue with criteria and a scope packet, excluding epics, active claims and issues with an open closing PR. Require dependencies completed and no overlap with active work, including tests. Rank earliest milestone, then board Priority or priority label, then issue number. Wait for a parent PR to merge; never create a stacked draft.

Use the host's enforced claim if available; otherwise run serially. Re-read claims before and after recording `state:claimed`; stop on conflict. A stale claim is investigated, not permission to overwrite work. Keep the five board columns Backlog, Todo, In progress, Review, Done and existing membership behavior. Claimed work moves to In progress; linked PR to Review; completed issue to Done.

**Exit gate:** one exclusive assignment, or queue empty/wait reason.

## 4. Deliver

Ask the host to dispatch leaf assignments with this complete brief, filled with actual values:

```text
Intent: <approved milestone and issue URLs; user outcome>.
Criteria: <observable acceptance criteria and prototype direction>.
Scope: <owned paths including tests; exclusions; dependencies; claim>.
Checkout: <worktree>; base <ref + SHA>; head <branch + SHA>.
Decisions: <recorded choices; delegated bounds; owner-reserved decisions>.
Evidence: <plan, commands/exits, captures, findings and prior attempts>.
Perform only <implementation | technical adjudication | review axis A/B |
VCS start/commit/open/tend | milestone | release | health> under its owning
skill. Do not dispatch workers or invoke orchestration. Preserve other edits.
Return evidence, changed paths, resulting head, exit gate and remaining decisions
in at most 8 lines; never expose credentials.
```

Require focused tests, scope containment and the project's verify gate before delivery. Every changed/untracked path must belong to the packet or approved alwaysInScope prefixes. Independent reviewers receive fresh context and credentials inaccessible to the craftsman; selecting an account in a shared token store is not isolation. Review the exact head; resolve blockers, not optional suggestions. Have the host assign VCS to open a ready PR with auto-merge awaiting valid approval/checks.

**Exit gate:** ready PR and evidence for its exact head, or bounded failure record.

## 5. Recover and close

On failure, trace the raising call, attempt at most two evidence-led fixes, then replan or wait with a concrete retry condition. Retain the lane; technical difficulty alone never becomes `lane:owner`. Request fresh technical adjudication within approved constraints through the host. Only an owner-reserved decision waits on the owner. Preserve useful work and report the blocker.

Have the host assign lessons and safe worktree cleanup to their owning skills. Stop health work at its product-defined bound.

**Exit gate:** delivery or recorded replan/wait, with lane retained unless authority changed.

## Output

At most 8 lines: **Summary:** linked delivery, commands/exits, evidence and waits. **Decision:** only reserved owner choices with recommendation, or “Nothing needed.” Update the configured queue; send notifications only through its authorized configured channel.
