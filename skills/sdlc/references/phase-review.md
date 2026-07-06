# REVIEW Phase

Review the patch, sensor results, and unresolved risks before human approval.

## Initialization

- Verify EXECUTE is `COMPLETED`.
- Confirm deterministic sensors either passed or have documented exceptions and risks.

## Configuration

- Generate the git diff and collect sensor results, retry history, guide selections, and event log entries.

## Execution

- Write review details under `phases.REVIEW.review`.
- Run AI code review or architecture review as inferential sensors when selected.
- Resolve, accept with rationale, or record each AI review finding as an unresolved risk.
- Verify ADR-0005 observability deliverables against the spec when applicable: telemetry emission, dashboard config, alerting logic, and test coverage.

## Verify

- In `afk` mode, run a separated reviewer pass over the diff, brief, spec, guides, sensor results, and risks. Approval requires `result: APPROVED`.
- In `hil` mode, summarize changes, verification results, observability evidence, diff highlights, retry history, and unresolved risks; request approval and stop.

## Improve

- Append REVIEW lessons to `phases.REVIEW.improvements`.
- After approval, set `phases.REVIEW.approved: true`.
- Mark REVIEW `COMPLETED`, set `current_phase: "SHIP"`, and reset `lifecycle_stage: "INITIALIZATION"`.
