# ADR-0007: Model SDLC as a Task Hierarchy

> Superseded by ADR-0008 for the default portable SDLC contract. Its serialization guidance remains useful to adapters that persist the contract.

## Decision

Model persisted SDLC work as one Task aggregate with nested, append-only records:

```text
Task → Stage[] → Phase[] → Lifecycle[]
```

Stage kinds are `DEFINE`, `REFINE`, `EXECUTE`, and `IMPROVE`; `CLOSED` is the terminal Task state. Each Stage maps to one stage skill. Root `sdlc` owns the shared `DEFINE → EXECUTE → VERIFY → IMPROVE → COMPLETE` lifecycle, while each stage skill owns its Phase details.

The completed DEFINE Lifecycle result is the Definition, the completed REFINE Lifecycle result is the approved Specification, and the completed IMPROVE Lifecycle result is the retrospective. These values are not duplicated at the Task level.

The EXECUTE Stage appends a Phase path beginning with PLAN, EXECUTE, and REVIEW. REVIEW may append a corrective PLAN or EXECUTE Phase, followed by REVIEW, or append SHIP when the candidate is ready. Each Phase owns its own shared Lifecycle history. One SHIP Phase spans candidate preparation, digest-bound acceptance, and finalization.

The released serialization is schema version 1. Lightweight hosts persist one Task YAML snapshot and optional Task Links. Harnesses may supply their own coordination infrastructure while preserving the same nested contract.

Schema v1 Lifecycles carry RFC3339 start and completion timestamps. A validated snapshot can therefore produce deterministic raw evidence: elapsed time, structural counts, review and rework counts, first-pass delivery, and verification success rate. A closed snapshot with a policy-bound scorecard can additionally derive the portable SDLC Health Score defined by ADR-0009 using the immutable cohort-derived Story Points policy defined by ADR-0011. An unbound closed calibration Task remains `UNSCORED` while retaining its raw evidence. The report and score are derived evidence, not mutable Task fields or model-dependent assessments.

## Context

The earlier split record separated Task from delivery history. It required an artificial execution identity, duplicated lifecycle context, and made the structure harder for agents to navigate. A nested record follows the skill hierarchy directly and keeps every result next to the lifecycle that produced it.

## Consequences

- Agents can locate work by descending one explicit hierarchy rather than resolving a separate execution document.
- Stage skills map directly to persisted Stage kinds, while root lifecycle rules remain shared and consistent.
- Definition, Specification, and retrospective provenance is unambiguous because each resides in its producing Lifecycle result.
- Correction loops append Phases and Lifecycles without rewriting evidence.
- Task Links continue to relate independent Tasks without expanding the Task hierarchy.
- The same snapshot yields the same raw measurement and health score across hosts; host-specific token, model, and cost telemetry remains outside this portable schema.
