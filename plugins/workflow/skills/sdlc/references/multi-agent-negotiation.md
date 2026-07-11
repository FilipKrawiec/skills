# Review and Recovery

Each Recovery Window permits `1..3` autonomous tries. Never repeat an unchanged failed invocation. Persist cumulative usage and Flow Friction.

- REVIEW exhaustion with HIGH/CRITICAL findings rejects Task Execution and moves Task to IMPROVE.
- SHIP, deadline, or resource exhaustion enters `WAITING_FOR_HUMAN` without failing Task.
- Human Intervention is immutable input and starts a fresh bounded window. Budget and deadline changes are additive extension values; Specification remains frozen.
- Cooperative cancellation stops new dispatch, cancels children, preserves evidence at a safe boundary, marks Task Execution `CANCELLED`, and moves Task to IMPROVE.
- Follow-up reviews verify prior findings and delta-introduced regressions only; subjective polish cannot reopen scope.
