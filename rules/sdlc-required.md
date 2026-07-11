# SDLC Workflow Rule

Classify repository work before acting:

- `analysis-only`: read/report; no documents or write workflow.
- `plan-only`: create only the requested plan artifact.
- `bounded-change` / `full-delivery`: use the SDLC aggregate protocol.
- `workflow-maintenance`: explicit human-authorized repair of workflow controls without recursive invocation.

For delivery, Task follows DEFINE, SPEC, IN_DEVELOPMENT, IMPROVE, CLOSED. Definition and Specification freeze on transition. Task owns at most one dependent Task Execution. PLAN, EXECUTE, REVIEW, and SHIP are append-only Phase Runs with bounded recovery and deterministic sensors.

`LIGHTWEIGHT` coordinates through native agent/tool messaging and persists aggregate YAML documents; it does not emulate Level 0 or an outbox. `HARNESS` supplies explicit Level 0 and event-driven coordination. Both use the same schema v1 and domain invariants.

Only the root coordinator writes aggregate documents. Children receive compact packets and return structured evidence. Preserve unrelated user changes. Shipping requires the Candidate Result Acceptance Decision. Improvement is mandatory on every closing path.
