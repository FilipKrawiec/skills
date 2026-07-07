# SPEC Phase

Define the harness controls before implementation begins.

## Initialization

- Verify DEFINE is `COMPLETED` and the brief exists.

## Configuration

- Identify architectural boundaries, target components, affected files, and relevant existing decisions.
- Decide whether the task needs `domain-driven-design`, `hexagonal-architecture`, `tdd`, `vcs`, or `grill-with-docs`.

## Execution

- Use `grill-with-docs` to stress-test assumptions when the task involves a plan, PRD, ADR, or architecture choice.
- Define guide requirements: project rules, ADRs, architecture notes, testing conventions, coding style, templates, or issue/story formats.
- Define sensor requirements: compile, tests, formatting, linting, static analysis, architecture tests, dependency checks, and AI review.
- Define sandbox policy, approval policy, and event-recording requirements.
- For feature implementation work, apply ADR-0005 by defining observability requirements for metrics, logs, traces, dashboard panels, alerts, and telemetry verification. If observability is not relevant, record why it is out of scope.
- Write the final specification under `phases.SPEC.spec`.

## Verify

- Confirm `design_boundaries`, `affected_components`, `guide_requirements`, `sensor_requirements`, and `grill_results` are complete enough to plan execution.
- Confirm unresolved assumptions are either resolved or explicitly recorded as risks.

## Improve

- Append SPEC lessons to `phases.SPEC.improvements`.
- Mark SPEC `COMPLETED`, set `current_phase: "PLAN"`, and reset `lifecycle_stage: "INITIALIZATION"`.
- In `hil` mode, follow the main skill's Approval Gates rule before stopping for human approval.
