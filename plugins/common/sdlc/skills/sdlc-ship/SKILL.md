---
name: sdlc-ship
description: Execute the SHIP Phase of an Autonomous SDLC Delivery Task.
---

# SHIP Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active SHIP Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, decide approval, record events, or alter the Delivery Task.

Read [ship-phase.md](../sdlc-execute/references/ship-phase.md) for detailed execution steps when producing the `ShipmentCandidate`.
