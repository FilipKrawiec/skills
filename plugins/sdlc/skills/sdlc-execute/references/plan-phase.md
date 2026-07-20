# PLAN Phase Execution

The PLAN phase takes a `DeliveryContract` and optional correction context as input, and outputs an `ImplementationPlan` detailing how the deliverables will be implemented.

## Objectives
1. Read the `DeliveryContract` (which includes deliverables, completion conditions, acceptance criteria, constraints, risks, and the verification plan).
2. Produce an `ImplementationPlan` containing the schema fields in its YAML frontmatter, and details in markdown sections. Save it to `.sdlc/tasks/<task-id>/plan.md` (and copy/symlink it as a host-scoped artifact if requested by the host). The markdown file should contain:
   * **Slices**: Logical increments/steps of implementation.
   * **Boundaries**: Codebases, paths, files, or subsystems that will be modified.
   * **Verification Plan**: Verification strategies, unit tests, and validation scripts to run.
   * **Recovery Controls**: Steps or procedures to roll back or debug failures.
3. Propose a successful `PhaseOutcome` of kind `Succeeded` containing:
   * `work_product`: The proposed `ImplementationPlan` (represented by `plan.md`).
   * `contributors`: The list of Actors contributing to this plan (including yourself).
   * `evidence`: Immutable references or checklists supporting the plan creation.
   * `next_action`: `StartPhase` with `next_phase: EXECUTE` and `eligible_roles` as defined in the delivery role plan.
