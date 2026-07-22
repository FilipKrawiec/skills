# SHIP Phase Execution

The SHIP phase packages the changes into a shipment candidate ready for approval and subsequent IMPROVE stage execution.

## Objectives
1. Read the `ExecutionResult`, the `ReviewDecision { READY_FOR_SHIP }`, and associated evidence.
2. Produce a `ShipmentCandidate` with YAML frontmatter containing `release` and `evidence`, then detail those values in Markdown sections. The work product should contain:
   * **release**: Details about the release branch, build version, tag, or distribution channel.
   * **evidence**: The complete set of verified approvals, unit tests, and validation runs.
3. Propose a successful `PhaseOutcome` of kind `Succeeded` containing:
   * `work_product`: The proposed `ShipmentCandidate`.
   * `contributors`: The list of Actors contributing to this shipment (including yourself).
   * `evidence`: Pointers to release builds or distribution metadata.
   * `next_action`: `RequestApproval` of kind `SHIPMENT` with the `approval_requirement_id` and `eligible_roles` from the delivery role plan.
