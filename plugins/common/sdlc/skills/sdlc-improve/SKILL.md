---
name: sdlc-improve
description: Execute the IMPROVE Phase of an Autonomous SDLC Delivery Task.
---

# IMPROVE Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active IMPROVE Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, close the Delivery Task, record events, or alter the Delivery Task.

Produce the `ImprovementOutcome` as Markdown with YAML frontmatter containing `delivery_outcome`, `observations`, `risks`, and `follow_ups`. Return the work product through the active host's normal result mechanism.
