---
name: sdlc-execute
description: Use when tasked with executing any phase within the EXECUTE stage of an Autonomous SDLC Delivery Task (specifically PLAN, EXECUTE, REVIEW, or SHIP phases).
---

# EXECUTE Stage Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). It is the authority for domain language, contracts, and invariants.

Based on the active phase, immediately read the corresponding instruction below:
- Read [plan-phase.md](references/plan-phase.md) when the active phase is PLAN.
- Read [execute-phase.md](references/execute-phase.md) when the active phase is EXECUTE.
- Read [review-phase.md](references/review-phase.md) when the active phase is REVIEW.
- Read [ship-phase.md](references/ship-phase.md) when the active phase is SHIP.

Return the phase's proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`.

Do not enact that action, select its Actor, decide approval, record events, or alter the Delivery Task.
