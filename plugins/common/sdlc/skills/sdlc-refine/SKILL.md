---
name: sdlc-refine
description: Execute the REFINE Phase of an Autonomous SDLC Delivery Task.
---

# REFINE Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active REFINE Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, decide approval, record events, or alter the Delivery Task.

## Technical Specification Grilling

Before constructing the final `DeliveryContract`, use `grill-with-docs` to execute this technical grilling pass. Do not reopen strategic-fit or product-viability decisions resolved during DEFINE unless technical evidence disproves them.

1. **Codebase & Environment Audit**: Inspect existing code, interfaces, docs, and architecture relevant to the `Definition`. Identify technical friction, hidden complexities, and potential breaking changes.
2. **EventStorming for Business Behavior**: When the `Definition` introduces or changes a business workflow, run an EventStorming session before proposing contexts, aggregates, policies, or components. Scope the workflow; discover and sequence its past-tense domain events, including meaningful alternate paths; then identify their commands, initiators, reactions, and external interactions. Use event ownership and invariant-bearing decisions to justify responsibilities, rather than creating one component per event. Include an `## EventStorming` section in the Markdown body that records event-flow coverage and unresolved questions; keep the required `DeliveryContract` YAML frontmatter unchanged. When `ddd` is installed, use its EventStorming guidance for the detailed modeling pass.
3. **Contract Construction**: Produce the final `DeliveryContract` as Markdown with YAML frontmatter containing `deliverable`, `completion_condition`, `acceptance_criteria`, `constraints`, `risks`, `verification_plan`, and `delivery_role_plan`. Return the work product through the active host's normal result mechanism.

## Refinement Guidelines

When producing the `DeliveryContract`, you MUST enforce the following standards to guide the downstream implementation plan:

1. **No Overengineering**: Prohibit the introduction of unnecessary abstractions, helper objects, or utility wrappers (such as clock or identity helper wrappers) unless explicitly required by domain boundaries. Favor native primitives, clean language structures, and simplicity.
2. **Elegant & Optimized Solutions**: Mandate that the plan focus on clean code design, maximizing execution efficiency, and avoiding architectural bloat.
3. **Parallelizable Slices**: Structure deliverables and acceptance criteria to enable clear, parallelizable slices of implementation that can be built and verified independently.
4. **Pragmatic Verification**: Require simple, deterministic checks (like fast unit tests and static analysis) rather than booting heavy framework contexts unnecessarily.
