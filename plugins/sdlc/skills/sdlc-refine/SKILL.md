---
name: sdlc-refine
description: Execute the REFINE Phase of an Autonomous SDLC Delivery Task.
---

# REFINE Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active REFINE Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, decide approval, record events, or alter the Delivery Task.

Produce the `DeliveryContract` as a Markdown file with YAML frontmatter. Save it to `.sdlc/tasks/<task-id>/contract.md` (and copy/symlink it as a host-scoped artifact if requested by the host).

## Refinement Guidelines

When producing the `DeliveryContract`, you MUST enforce the following standards to guide the downstream implementation plan:

1. **No Overengineering**: Prohibit the introduction of unnecessary abstractions, helper objects, or utility wrappers (such as clock or identity helper wrappers) unless explicitly required by domain boundaries. Favor native primitives, clean language structures, and simplicity.
2. **Elegant & Optimized Solutions**: Mandate that the plan focus on clean code design, maximizing execution efficiency, and avoiding architectural bloat.
3. **Parallelizable Slices**: Structure deliverables and acceptance criteria to enable clear, parallelizable slices of implementation that can be built and verified independently.
4. **Pragmatic Verification**: Require simple, deterministic checks (like fast unit tests and static analysis) rather than booting heavy framework contexts unnecessarily.
