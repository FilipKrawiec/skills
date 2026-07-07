# DEFINE Phase

Capture the task as a small, verifiable harness run.

## Initialization

- Retrieve requirements from the issue, prompt, or work item.
- Detect `afk` labeling or default to `hil`.
- Initialize `.sdlc/issues/<issue-id>-<branch-name>-<attempt-doubledigit>.yaml` from `assets/sdlc-template.yaml` when no active record exists.
- Ensure `.sdlc/` is ignored by Git.

## Configuration

- Set the phase scope and constraints.
- Identify whether the task needs new domain terms, ADRs, or guide/sensor changes.

## Execution

- Clarify intent with focused questions when the request is ambiguous.
- Write the task brief directly under `phases.DEFINE.brief`.
- Record constraints, acceptance criteria, and non-goals that keep the harness run bounded.

## Verify

- Confirm the brief has `summary`, `context`, `constraints`, `acceptance_criteria`, and `non_goals`.
- Check acceptance criteria are observable through deterministic sensors or explicit manual review.

## Improve

- Append DEFINE lessons to `phases.DEFINE.improvements`.
- Mark DEFINE `COMPLETED`, set `current_phase: "SPEC"`, and reset `lifecycle_stage: "INITIALIZATION"`.
- In `hil` mode, follow the main skill's Approval Gates rule before stopping for human approval.
