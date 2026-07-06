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
- Prefer TDD for code changes: failing test, minimal implementation, refactor, passing test evidence.
- Implement ADR-0005 observability tasks from the plan when applicable: instrumentation, logs/traces/metrics, dashboard configuration, alert rules, and telemetry tests.
- Record meaningful events such as `AgentInvocationStarted`, `PatchCreated`, `SensorRunStarted`, `SensorFindingDetected`, `CorrectionRequested`, and `PatchUpdated`.

## Verify

- Run deterministic sensors for the active step.
- Feed failed sensor findings back in machine-readable form.
- Retry only within `harness.sandbox.limits.max_correction_attempts`.
- If attempts are exhausted, mark the task failed, preserve the working tree, record unresolved risks, and follow `multi-agent-negotiation`.

## Improve

- Append EXECUTE lessons to `phases.EXECUTE.improvements`.
- Mark EXECUTE `COMPLETED`, set `current_phase: "REVIEW"`, and reset `lifecycle_stage: "INITIALIZATION"`.
