# REVIEW Phase Execution

The REVIEW phase evaluates the `ExecutionResult` against the original `DeliveryContract` to determine if the changes are ready for shipment or require corrections.

> [!IMPORTANT]
> **Adversarial & Critical Mindset Required**
> As a reviewer, you **MUST NOT** act as a passive rubber stamp. Your core duty is to actively challenge the implementation plan, the execution results, the design, and the testing. You must aggressively seek out contradictions, architectural bad smells, suboptimal approaches, omissions, and fragile workarounds. If a better or more clean solution exists, it is your responsibility to identify it and trigger rework.
> 
> **Pragmatic Delivery Balance**
> Challenge does not mean obstruction. Do not reject changes for pedantic formatting preferences, style nuances, or subjective debates that do not impact correctness, robustness, security, or maintainability. If the approach is sound and correct, accept it as `READY_FOR_SHIP`, and record minor cleanup suggestions in the findings for future action.

## Objectives
1. **Critical Input Review**: Read the `DeliveryContract`, the `ImplementationPlan`, the `ExecutionResult`, and any prior rework/corrections.
2. **Four-eyes / Segregation of Duties Enforcement**:
   * You **MUST NOT** execute the REVIEW phase if you were a Contributor to the `ExecutionResult` being evaluated.
3. **Rigorous Comparison & Challenge**:
   * Contrast code and verification results directly against the contract deliverables and acceptance criteria.
   * Challenge the implementation approach: Did the executor take shortcuts? Is there code duplication, fragile logic, or missing edge cases?
   * Search for contradictions between the plan, code, and tests (e.g., tests passing but not asserting the correct business logic, or code deviating from contract constraints).
4. **Determine Rework vs. Shipment**:
   * If the plan itself was flawed or didn't address design/architectural boundaries properly, select **`CORRECT_PLAN`**.
   * If the plan was acceptable but the execution was incomplete, had bugs, used poor code quality, or failed verification, select **`CORRECT_EXECUTE`**.
   * Only select **`READY_FOR_SHIP`** if the implementation is clean, optimal, fully verified, and leaves no unresolved concerns.
5. **Produce the Review Decision**:
   * Save the `ReviewDecision` as a Markdown file with YAML frontmatter to `.sdlc/tasks/<task-id>/review.md` (and copy/symlink it as a host-scoped artifact if requested by the host).
   * **decision**: Exactly one of `CORRECT_PLAN`, `CORRECT_EXECUTE`, or `READY_FOR_SHIP` (placed in the YAML frontmatter).
   * **findings**: A detailed markdown report justifying your decision. You **MUST** document any challenged design choices, contradictions found, or suboptimal approaches, even if you ultimately decide the changes are `READY_FOR_SHIP`.
6. **Propose Phase Outcome**: Propose a successful `PhaseOutcome` of kind `Succeeded` containing:
   * `work_product`: The proposed `ReviewDecision` (represented by `review.md`).
   * `contributors`: The list of Actors contributing to this review.
   * `evidence`: Telemetry, unit test outputs, or run logs supporting the findings.
   * `next_action`: `StartPhase` with `next_phase` matching:
     * `PLAN` if decision is `CORRECT_PLAN`.
     * `EXECUTE` if decision is `CORRECT_EXECUTE`.
     * `SHIP` if decision is `READY_FOR_SHIP`.
