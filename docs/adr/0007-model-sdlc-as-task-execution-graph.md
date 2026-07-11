# ADR-0007: Model SDLC with Task Aggregates

## Decision

Model SDLC as behavior over Task, Task Execution, and Task Link aggregates rather than as a Workflow entity or linear phase cursor.

Task is behavior-rich and stage-gated. Definition, Specification, and Retrospective are Task-owned values. Task owns zero or one dependent Task Execution by a distinct identity. Task Execution remains a separate consistency boundary because Phase Run and HIL recovery history is high-churn and potentially unbounded.

Task Execution owns append-only PLAN, EXECUTE, REVIEW, and SHIP Phase Runs. Review is bounded and deterministic after its first broad pass. One SHIP run spans candidate preparation, digest-bound acceptance, and finalization. Every closing path produces Retrospective before Task closes.

The first released serialization is schema version 1. Lightweight hosts persist separate aggregate YAML snapshots and coordinate through native messaging. The Quarkus Harness supplies explicit Level 0 and at-least-once event coordination. Both use the same semantic request/result contracts.

## Context

The discarded single-record model conflated task definition, delivery, retry history, shipping approval, and improvement. It required rewinding a linear cursor, grew without clear aggregate boundaries, and forced Harness infrastructure into lightweight agent sessions.

## Consequences

- Frozen Task values make execution outcomes comparable and learnable.
- One-to-one Task Execution prevents speculative successor logic while isolating high-churn delivery history.
- Failed or rejected delivery derives a new Task when Specification must change.
- Task Links provide provider-neutral relationships between independent Tasks.
- Aggregate snapshots, transition validation, and artifact digests make lightweight runs resumable and Harness fixtures processable.
