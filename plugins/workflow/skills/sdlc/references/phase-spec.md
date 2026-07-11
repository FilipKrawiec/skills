# SPEC Task Stage

Collaborate with the human to create the Specification: deliverable, completion condition, acceptance criteria, constraints, non-goals, repository boundary, risks, controls, Resource Budget, collaboration mode, and recovery-window size `1..3`.

Human approval freezes Specification, reserves the distinct TaskExecutionId, changes Task to `IN_DEVELOPMENT`, and emits `TaskExecutionRequested` in HARNESS or performs the equivalent native handoff in LIGHTWEIGHT. Specification never reopens.
