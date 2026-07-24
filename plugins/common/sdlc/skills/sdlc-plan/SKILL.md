---
name: sdlc-plan
description: Execute the PLAN Phase of an Autonomous SDLC Delivery Task.
---

# PLAN Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active PLAN Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, record events, or alter the Delivery Task.

Read [plan-phase.md](../sdlc-execute/references/plan-phase.md) for detailed execution steps when producing the `ImplementationPlan`.
