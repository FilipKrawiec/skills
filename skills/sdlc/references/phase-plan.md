# PLAN Phase

Turn the spec into a bounded implementation and verification plan.

## Initialization

- Verify SPEC is `COMPLETED`.

## Configuration

- Scan the repository only as much as needed to identify target files, test files, commands, and likely integration points.
- Keep root context small; load detailed code context only when it is needed for a task.

## Execution

- Write the implementation plan under `phases.PLAN.plan`.
- Select concrete guides and sensors.
- Specify sandbox strategy, retry policy, and human approval gates.
- For feature implementation work, include ADR-0005 observability deliverables: telemetry requirements, dashboard/alert config work, instrumentation tasks, and telemetry verification commands/tests unless explicitly out of scope.
- Break work into sequential execution steps.
- For each step, list threads, tasks, skills, and deterministic `verify_command` values.
- Mark parallelizable work only when commands and target files are safe to run concurrently.
- Plan version-control integration toward one cohesive reviewed change.

## Verify

- In `afk` mode, run a separated reviewer pass against the brief, spec, selected controls, and plan. Approval requires `result: APPROVED`.
- In `hil` mode, summarize key tasks, affected files, selected guides/sensors, observability plan, and verification strategy; request approval and stop.

## Improve

- Append PLAN lessons to `phases.PLAN.improvements`.
- After approval, set `phases.PLAN.approved: true`.
- Mark PLAN `COMPLETED`, set `current_phase: "EXECUTE"`, and reset `lifecycle_stage: "INITIALIZATION"`.
