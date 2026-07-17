---
name: sdlc-execute
description: Execute a PLAN, EXECUTE, REVIEW, or SHIP Phase of an Autonomous SDLC Delivery Task.
---

# EXECUTE Stage Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active PLAN, EXECUTE, REVIEW, or SHIP Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, decide approval, record events, or alter the Delivery Task.
