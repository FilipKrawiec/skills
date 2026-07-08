# EXECUTE Phase

Produce a patch through the bounded feedback loop.

## Initialization

- Verify PLAN is `COMPLETED` and `approved: true`.
- Confirm selected guides, sensors, sandbox policy, and retry limit are present.

## Configuration

- Apply selected guides before editing.
- Keep code and test context scoped to the active task.
- Confirm the working tree status and preserve unrelated user changes.

## Execution

- Run the selected agent/work in the configured sandbox when the environment supports it.
- Produce the patch in small vertical slices.
- The root agent coordinates the EXECUTE phase but must never directly write tests, modify code, or run test suites.
- Delegate the implementation steps to specialized subagents:
  1. Red Stage: Spawn subagent to write tests and verify they fail in its sandbox.
  2. Green Stage: Spawn subagent to implement code and verify tests pass.
  3. Refactor Stage: Spawn subagent to optimize code and verify tests remain green.
- Ensure all compilation and test logs are run and isolated within the subagent's sandbox. The subagent must return only the high-level progression status (success, error details, and updated files) to keep the root context clean.
- Implement ADR-0005 observability tasks from the plan when applicable.
- Record meaningful events such as `AgentInvocationStarted` (per subagent spawn), `PatchCreated`, `SensorRunStarted`, `SensorFindingDetected`, `CorrectionRequested`, and `PatchUpdated`.

## Verify

- Run deterministic sensors (such as full build and test suites) as black-box checks.
- If sensors fail, delegate the correction task to a specialized tester subagent, ensuring the root context is not polluted with raw logs.
- Retry only within `harness.sandbox.limits.max_correction_attempts`.
- If attempts are exhausted, mark the task failed, preserve the working tree, record unresolved risks, and follow `multi-agent-negotiation`.

## Improve

- Append EXECUTE lessons to `phases.EXECUTE.improvements`.
- Mark EXECUTE `COMPLETED`, set `current_phase: "REVIEW"`, and reset `lifecycle_stage: "INITIALIZATION"`.
