---
name: sdlc-refine
description: Execute the REFINE Phase of an Autonomous SDLC Delivery Task.
---

# REFINE Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active REFINE Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, decide approval, record events, or alter the Delivery Task.

Produce the `DeliveryContract` as a Markdown file with YAML frontmatter. Save it to `.sdlc/tasks/<task-id>/contract.md` (and copy/symlink it as a host-scoped artifact if requested by the host).
