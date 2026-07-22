# EXECUTE Phase Execution

Implement the approved `ImplementationPlan` within its defined boundaries.

1. Make the planned changes and run the specified verification.
2. Produce an `ExecutionResult` as Markdown with YAML frontmatter containing `change_summary`, `verification`, `skipped_checks`, and `residual_risks`.
3. Propose `Succeeded` with the `ExecutionResult`, its non-empty contributors and evidence, and `StartPhase(REVIEW)` using the eligible roles from the Delivery Role Plan. Return a `BlockerReport` if the work cannot proceed.
