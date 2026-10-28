---
name: afk
description: Use when a scheduled task or an orchestrating session's brief asks for one unattended AFK run, optionally naming the issue, in a repository with .github/lanes.json. Never for an owner's own interactive work.
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*,lsof:*)
---

# AFK

Deliver one authorized bounded slice per run. Read `.github/lanes.json` from `origin/<base>` (`base` defaults to `main`); use its branchPrefix, scope, project and claim settings. Never change the main checkout.

Act as orchestrator through native subagents; own assignments, dependencies, recovery and GitHub records. The host supplies model routing and existing credential mechanisms. Serialize implementation unless native coordination and disjoint scopes including tests/dependencies are proven; labels are not atomic exclusion. Workers load the assigned skill, return evidence and never redispatch or advance phases.

Read [setup.md](references/setup.md) when enabling or scheduling runs; read [github-safety.md](references/github-safety.md) when checking GitHub protections.

## 1. Establish authority

Assign `ship` to observe actual base health, then read the issue's recorded authorization, criteria, scope packet, dependencies and decisions, plus its approved milestone brief when governing the work. Approved milestones authorize routine engineering decisions within those constraints; record the recommended choice. New interactions require the owner's prototype direction before implementation. Reserve new paid services, budget increases, changed product/strategy intent, authority changes and exact production approval for the owner; existing services within explicit budgets are delegated.

For milestone orchestration, use `milestone` at the orchestrator level; never assign an orchestrator as a leaf. Assign only the needed `release` or `health` phase and collect its result before advancing. Test delivery is automatic within approved constraints; production requires exact owner approval for the candidate and destination.

**Exit gate:** authorized slice and healthy base, or a recorded wait reason.

## 2. Tend owned PRs

Before selecting new work, inspect each owned open PR and its issue. Assign VCS to reconcile head, checks and threads, and implementation to fix confirmed blockers within approved scope. Preserve lane authorization. Apply bounded diagnosis/replanning from phase 5; keep a visible wait and retry condition if unresolved. Existing PRs stay in this recovery loop instead of being abandoned by candidate filtering.

**Exit gate:** owned PRs ready or recorded for recovery/wait; exact heads and next actions known.

## 3. Select and claim

Choose an open `lane:afk` issue with criteria and a scope packet, excluding epics, active claims and issues referenced by any open PR. Run `gh pr list --state open --limit 1000 --json number,body`; exclude issue numbers mentioned in bodies, including `Part of`, which may not create a GitHub linked PR. If the listing is incomplete, wait. Verify dependencies' required outcomes, not just closed state; shared files never block. Rank earliest milestone, then board Priority or priority label, then issue number. Wait for a parent PR to merge; never create a stacked draft.

Use the host's enforced claim if available; otherwise run serially. Re-read claims before and after recording `state:claimed`; stop on conflict. A stale claim is investigated, not permission to overwrite work. Update board state only by the transitions owned by `spec`; status never grants authority.

**Exit gate:** one exclusive assignment, or queue empty/wait reason.

## 4. Deliver

Dispatch native workers with this complete brief, filled with actual values:

```text
Intent: <issue URL; owner decision or matching approved milestone; outcome>.
Criteria: <observable acceptance criteria and prototype direction>.
Scope: <owned paths including tests; exclusions; dependencies; claim>.
Checkout: <worktree>; base <ref + SHA>; head <branch + SHA>.
Decisions: <recorded choices; delegated bounds; owner-reserved decisions>.
Evidence: <plan, commands/exits, captures, findings and prior attempts>.
Responsibility: <Product partner|Craftsman|Reviewer|Delivery steward>.
Load <owning skill>; perform only <specified phase/intent>.
No dispatch, next phase, self-approval or promotion credentials. Preserve edits.
Return evidence, changed paths, resulting head, exit gate and remaining decisions
in at most 8 lines; never expose credentials.
```

Require focused tests, scope containment and the project's verify gate before delivery. Every changed/untracked path must belong to the packet or approved alwaysInScope prefixes. Collect fresh `review` axes for the exact head, then assign VCS to open the ready PR and `agent-review` to record the binding GitHub decision. Craftsman never approves. Resolve blockers, not optional suggestions; missing posting capability waits on merge, not preparation.

**Exit gate:** ready PR and evidence for its exact head, or bounded failure record.

## 5. Recover and close

On failure, trace the raising call, attempt at most two evidence-led fixes, then replan or wait with a concrete retry condition. Retain the lane; record wait cause, responsible actor, evidence and resumption condition. Technical difficulty alone never becomes `lane:owner`. Request fresh technical adjudication within approved constraints as a fresh native worker. Only an owner-reserved decision waits on the owner. Preserve useful work and report the blocker.

Assign lessons and safe worktree cleanup to their owning skills. At a bounded health stop, keep unfinished required migrations as next-product prerequisites.

**Exit gate:** delivery or recorded replan/wait, with lane retained unless authority changed.

## Output

At most 8 lines: **Summary:** linked delivery, commands/exits, evidence and waits. **Decision:** next action/actor, or reserved owner choices with recommendation. Use “Nothing needed” only with no pending action. Update the configured queue; send notifications only through its authorized configured channel.
