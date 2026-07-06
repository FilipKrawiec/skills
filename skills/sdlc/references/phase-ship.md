# SHIP Phase

Integrate the approved change without expanding scope.

## Initialization

- Verify REVIEW is `COMPLETED`, `approved: true`, and required CI or local verification is green.

## Configuration

- Identify target branch, commit style, merge strategy, and any repository-specific release constraints.

## Execution

- Commit or merge only after human approval.
- Prefer a single cohesive squashed commit on trunk.
- Deployment is out of scope unless the active record explicitly includes it.

## Verify

- Run post-merge or post-deployment verification when applicable.
- If verification fails, preserve evidence and return to REVIEW with a corrective plan.

## Improve

- Append SHIP lessons to `phases.SHIP.improvements`.
- Mark SHIP `COMPLETED`, set `current_phase: "IMPROVE"`, and reset `lifecycle_stage: "INITIALIZATION"`.
