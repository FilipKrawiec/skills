# REVIEW Phase

Review the patch, sensor results, and unresolved risks before human approval.

## Initialization

- Verify EXECUTE is `COMPLETED`.
- Confirm deterministic sensors either passed or have documented exceptions and risks.

## Configuration

- Generate the git diff and collect acceptance criteria, sensor results, skipped checks, retry history, guide selections, and event log entries.

## Execution

- Write review details under `phases.REVIEW.review`.
- Check acceptance criteria coverage, deterministic sensor evidence, skipped checks and risk, correction history, and unresolved risks.
- Run AI code review or architecture review as inferential sensors when selected.
- Treat persona or AI review as secondary to deterministic evidence, not a substitute for it.
- Resolve, accept with rationale, or record each AI review finding as an unresolved risk.
- Verify ADR-0005 observability deliverables against the spec when applicable: telemetry emission, dashboard config, alerting logic, and test coverage.

## Verify

- In `afk` mode, run a separated reviewer pass over the diff, brief, spec, guides, sensor results, and risks. Approval requires `result: APPROVED`.
- In `hil` mode, follow the main skill's Approval Gates rule before requesting approval and stopping.

## Improve

- Append REVIEW lessons to `phases.REVIEW.improvements`.
- After approval, set `phases.REVIEW.approved: true`.
- Mark REVIEW `COMPLETED`, set `current_phase: "SHIP"`, and reset `lifecycle_stage: "Assessment"`.
