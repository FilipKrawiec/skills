---
name: milestone
description: Use when an owner approves a product outcome and an orchestrator must delegate its delivery through production acceptance and bounded health.
allowed-tools: Skill Read Edit Bash
---

# Milestone

## 1. Establish direction

Act as orchestrator using the harness's native subagents. The Product Engineer approves outcomes, constraints, interaction direction, critical exceptions and exact demonstrated production candidates. Agents own routine refinement, implementation, technical decisions, review, merge and test delivery.

Create or reuse a native GitHub milestone for each production chunk, titled only `v<MAJOR>` with the next unused major; its merges become `<MAJOR>.<MINOR>.<PATCH>` release candidates under `release`. Record its outcome, constraints, non-goals, acceptance, confidence gates, brief revision and approval source in its description; link included issues. For new interactions, obtain direction on a lightweight prototype; established interactions name an accepted pattern. A trusted direct owner request authorizes its specified work without another approval loop.

**Exit gate:** recorded authority binds the outcome and direction; missing reserved decisions are explicit.

## 2. Assign and reconcile

Own phase advancement, assignments, dependencies, recovery and durable GitHub records. Resume from actual issue decisions, milestone revision, worktree, PR head, checks, review and deployment evidence; summaries never prove completion. Reuse existing issues, plans, PRs and candidate records rather than duplicating them.

Assign Product partner to refinement/specification and planning; Craftsman to bounded implementation and verification; fresh Reviewer to independent judgment and GitHub approval; Delivery steward to merge observation, test delivery, demo and production readiness. These are responsibilities, not a registry. Use the owning skills; workers return their exit gate and never redispatch or advance phases. They may request another assignment. Run implementation in parallel when native coordination holds each issue once; shared files never block, the later PR resolves conflicts. Read-only reviews run independently.

Fill this complete brief for every assignment; each worker loads only its task and supplied context:

```text
Responsibility/task: <Product partner|Craftsman|Reviewer|Delivery steward>;
load <owning skill>; perform only <phase/intent>; no dispatch/next phase.
Intent/authority: <repo, milestone, issue, approved revision/source>.
Acceptance/direction: <observable criteria; prototype or accepted pattern>.
Scope: <owned paths/tests, exclusions, preserved edits, dependencies>.
Checkout: <worktree>; base <ref/SHA>; head <branch/SHA>.
Decisions/bounds: <decisions; delegated authority; reserved exceptions>.
Evidence: <plan, attempts, findings, checks, deployment/demo links>.
Verify: <concrete focused commands, confidence gates, required outputs>.
Stop: <contradictions, bounds, missing evidence>; return dependent waits.
Authority: Craftsman never approves; Reviewer never implements; use only
existing authorized GitHub identity mechanisms; no production credentials.
Return <=8 lines: Summary with paths, exact head, commands/exits and exit
gate; Decision with next action/actor, reserved options/recommendation.
```

Before each advance, reconcile the returned head, evidence and scope with GitHub. Dispatch `spec` for issue/label transitions and `vcs` for branch/PR lifecycle. Collect both `review` axes for the exact head, plus a fresh verifier for any blocking finding, before opening a ready PR; pass those verdicts to `agent-review` to independently verify evidence and record the Reviewer's binding GitHub decision. A local verdict alone never permits merge. After blockers, assign Craftsman repairs then Reviewer verification at the new head. Changed-head evidence expires.

**Exit gate:** each assignment has an actor and verified result or explicit wait; review and required protections gate merge.

## 3. Recover within authority

After two evidence-led failed repairs, assign bounded diagnosis/replanning or fresh technical adjudication. Preserve work, lane authorization, attempts and retry condition. Never turn technical difficulty into owner ownership. Await the owner only for changed intent/direction/strategy, new paid services/budget increases, protected authority or weakened quality gates. Record the exact question, options and recommendation; continue independent authorized preparation.

**Exit gate:** recovery or reserved decision has an actor, evidence and resumption condition.

## 4. Deliver and continue

After merge, assign `ship` to observe base health and `release` for automatic test delivery, prepared demo and separately approved production. Close the product milestone only with exact deployed-and-accepted evidence. Then assign `health` to create and deliver its linked bounded GitHub milestone. Rank next product proposals; do not treat them as approved or skip required health prerequisites.

**Exit gate:** production acceptance and health state recorded, next proposal ranked; pending stages retain responsible actors.

## Output

Session replies <=5 lines; reports <=8. **Summary:** milestone revision, evidence, waits and ranked proposal. **Decision:** next action and actor; reserved options and recommendation. Include commands/exits; use “Nothing needed” only with no pending action.
