---
name: orchestrate-delivery
description: Use when an orchestrator coordinates a bounded project change from business intent through specification, task dispatch, persona assignment, evidence review, and ship-or-return decisions.
---

# Provider-Neutral Delivery Orchestration

The **orchestrator** owns the delivery decision flow but does not edit implementation code. A host may conduct DEFINE and specification conversations remotely, then dispatch the executable plan to installed local or remote harnesses. A human operator acts as Product Owner during initial intent definition and specification refinement; agents execute, verify, audit, and self-correct work in bounded Git worktrees.

1. **DEFINE** — Capture business outcomes, scope, non-goals, constraints, and decision owner. Read `vcs` to create and checkout a dedicated short-lived feature branch off current `main`/trunk for the delivery intent. Record initial requirements in `implementation_plan.md`. Ask the user only about material ambiguity.
2. **SPECIFY / GRILL** — Inspect the target repository and relevant Central and Project Knowledge entries. Challenge contradictions, risks, scope boundaries, and acceptance conditions with the user. Update `implementation_plan.md`. Read `grill-with-docs` when source-backed challenge is needed.
3. **PLAN** — Create minimal dependency-aware cohesive delivery slices, not artificial microtasks. Construct a Directed Acyclic Graph (DAG) of cohesive delivery slices with explicit file path boundaries. Publish `implementation_plan.md` with interactive user review request (`RequestFeedback: true`). Each task packet defines fields in [task-packet.md](references/task-packet.md), including worktree provenance, assigned persona, dependencies, and path boundaries. Read [autonomous-rework-loop.md](references/autonomous-rework-loop.md) for DAG scheduling rules.
4. **DISPATCH** — Create dedicated Git worktree and short-lived branch from the declared base revision for each slice. Select and assign the slice to the designated agent persona (`developer`) specified in [agent-personas.md](references/agent-personas.md). The executor retains the slice context end-to-end to understand local code, implement, use TDD where relevant, run and fix the verification loop, and return reviewable diff evidence.
5. **COLLECT / VERIFY** — Collect each executor's change summary, verification result, evidence, and blockers. Run deterministic verification gates (`python3 scripts/project-verify.py verify`). Record verification evidence in `walkthrough.md`. If verification fails, initiate the autonomous rework loop (up to `max_retries: 3`), feeding failure logs directly back to the executor persona. An executor stops and returns the slice when a material boundary issue emerges. Read [autonomous-rework-loop.md](references/autonomous-rework-loop.md).
6. **REVIEW** — Conduct multi-persona review (`quality-engineer`, `solution-architect`, `security-auditor`) auditing TDD assertion strength, DDD domain purity, Hexagonal layer isolation, and OWASP security risks. Update `walkthrough.md`. Read [agent-personas.md](references/agent-personas.md). If a reviewer returns `CORRECT_EXECUTE` or `CORRECT_PLAN`, re-dispatch autonomously to the executor with correction payload until approved or retry limit (N <= 3) is reached.
7. **SHIP / RETURN** — Once changes pass all verifications and persona reviews, commit the verified changes, push the branch to remote origin (`git push`), and create exactly one durable **Delivery Record** for the cohesive delivery slice in the configured tracker before publishing its **Review Request** on the short-lived task branch. Present the work to the Product Owner with interactive merge authorization instructions. Executors do not merge, approve, or force-push protected default branches; the user retains merge authority.

---

## Context Pointers

- Read [task-packet.md](references/task-packet.md) when preparing or reviewing task packets.
- Read [agent-personas.md](references/agent-personas.md) when assigning or role-playing agent personas (`developer`, `quality-engineer`, `solution-architect`, `security-auditor`).
- Read [autonomous-rework-loop.md](references/autonomous-rework-loop.md) when scheduling DAG task slices or executing autonomous retry loops.
- Read [local-orchestrator-config.md](references/local-orchestrator-config.md) when loading or validating local routing configuration.
