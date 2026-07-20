# REVIEW Phase Execution

The REVIEW phase evaluates the `ExecutionResult` against the original `DeliveryContract` to determine if the changes are ready for shipment or require corrections.

## Objectives
1. Read the `DeliveryContract`, the `ExecutionResult`, and any prior rework or corrections.
2. Enforce the **Four-eyes / Segregation of Duties** rule:
   * You **MUST NOT** execute the REVIEW phase if you were a Contributor to the `ExecutionResult` being evaluated.
3. Compare the verified changes against the contract deliverables and acceptance criteria.
4. Produce a `ReviewDecision` containing the schema fields in its YAML frontmatter, and detailed findings in markdown sections. Save it to `.sdlc/tasks/<task-id>/review.md` (and copy/symlink it as a host-scoped artifact if requested by the host). The file should contain:
   * **decision**: Exactly one of `CORRECT_PLAN`, `CORRECT_EXECUTE`, or `READY_FOR_SHIP` (placed in the YAML frontmatter).
   * **findings**: Detailed observations, test results, or feedback justifying the decision (placed in the markdown body).
5. Propose a successful `PhaseOutcome` of kind `Succeeded` containing:
   * `work_product`: The proposed `ReviewDecision` (represented by `review.md`).
   * `contributors`: The list of Actors contributing to this review.
   * `evidence`: Telemetry, unit test outputs, or run logs supporting the findings.
   * `next_action`: `StartPhase` with `next_phase` matching:
     * `PLAN` if decision is `CORRECT_PLAN`.
     * `EXECUTE` if decision is `CORRECT_EXECUTE`.
     * `SHIP` if decision is `READY_FOR_SHIP`.
