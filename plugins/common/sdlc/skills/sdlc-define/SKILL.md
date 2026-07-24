---
name: sdlc-define
description: Execute the DEFINE Phase of an Autonomous SDLC Delivery Task.
---

# DEFINE Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active DEFINE Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, record events, or alter the Delivery Task.

## Strategic Definition Grilling

Use `grill-with-docs` to perform the mandatory strategic Definition grilling against the available context and references.

Focus it on:

1. **Bigger-picture fit**: the strategic goal, customer problem or measurable outcome, beneficiaries, priority relative to competing work, and consequence of not pursuing it.
2. **Viability**: evidence that the problem is real and the approach can work, material dependencies and risks, disconfirming signals, and a smaller validation or alternative.
3. **Decision readiness**: decisions needed now, explicit non-goals, and assumptions that may enter REFINE.

Produce the `Definition` as Markdown with YAML frontmatter containing `goal`, `scope`, `non_goals`, `decisions`, and `references`. Return the work product through the active host's normal result mechanism.
