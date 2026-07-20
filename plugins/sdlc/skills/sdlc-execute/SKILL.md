---
name: sdlc-execute
description: Use when tasked with executing any phase within the EXECUTE stage of an Autonomous SDLC Delivery Task (specifically PLAN, EXECUTE, REVIEW, or SHIP phases).
---

# EXECUTE Stage Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). It is the authority for domain language, contracts, and invariants.

Based on the active phase, immediately read the corresponding instruction below:
- Read [plan-phase.md](references/plan-phase.md) when the active phase is PLAN.
- Read [review-phase.md](references/review-phase.md) when the active phase is REVIEW.
- Read [ship-phase.md](references/ship-phase.md) when the active phase is SHIP.

If the active phase is EXECUTE:
Perform the code implementation as planned. Produce the `ExecutionResult` as a Markdown file with YAML frontmatter. Save it to `.sdlc/tasks/<task-id>/execution.md` (and copy/symlink it as a host-scoped artifact if requested by the host). Return either its proposed typed `PhaseOutcome` (kind `Succeeded` with an `ExecutionResult` represented by `execution.md`, `contributors`, `evidence`, and `next_action: StartPhase(REVIEW)`), or a `BlockerReport` if blocked.

Do not enact that action, select its Actor, decide approval, record events, or alter the Delivery Task.
