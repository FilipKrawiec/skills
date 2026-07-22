---
name: sdlc-define
description: Execute the DEFINE Phase of an Autonomous SDLC Delivery Task.
---

# DEFINE Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active DEFINE Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, record events, or alter the Delivery Task.

Produce the `Definition` as Markdown with YAML frontmatter containing `goal`, `scope`, `non_goals`, `decisions`, and `references`. Return the work product through the active host's normal result mechanism.
