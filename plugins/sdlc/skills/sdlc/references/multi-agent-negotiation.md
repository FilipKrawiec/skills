# Review and Recovery

Record every correction in the owning Phase Lifecycle; never rewrite completed evidence. A failed or cancelled lifecycle records its result, improvement evidence, and artifacts before the orchestrator chooses the next action.

- A REVIEW finding that changes the plan appends a new `PLAN` Phase; an implementation-only finding appends a new `EXECUTE` Phase. Each correction returns through REVIEW before SHIP.
- SHIP waits for human acceptance when required. A changed candidate requires a new REVIEW and acceptance; delivery friction alone may remain in SHIP if the candidate is unchanged.
- Human input is immutable evidence attached to the active Lifecycle. A resumption adds new Lifecycle or Phase history; it never erases prior work.
- Cooperative cancellation preserves the Task hierarchy at a safe boundary. Its failed or cancelled Lifecycle records the result and improvement evidence, then the orchestrator closes the Task with the matching terminal outcome.
- Follow-up reviews verify prior findings and delta-introduced regressions; subjective polish does not reopen completed scope.
