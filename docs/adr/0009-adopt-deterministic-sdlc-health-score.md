# ADR-0009: Adopt a Deterministic SDLC Health Score

## Decision

Adopt a portable, deterministic SDLC Health Score for schema-version-1 Task snapshots. The score is derived on demand from validated append-only Task evidence; it is never persisted as a mutable Task field.

Each Task holds `classification: null` and `scorecard: null` through DEFINE and REFINE. The approved transition that appends EXECUTE binds the immutable `{story_points}` classification. If a published policy has an entry for those points, root also copies the resolver's immutable `scorecard`: policy ID, raw-byte SHA-256, Story Points, historical P75 `target_elapsed_seconds`, and baseline sample size. If no entry exists, the Task enters calibration with `scorecard: null`. A closed policy-bound Task produces component scores for correctness, delivery, and pace, then computes the integer health score as:

```text
correctness = round(70% acceptance + 30% verification)
health      = round(50% correctness + 30% delivery + 20% pace)
```

Acceptance is 100 only for an `ACCEPTED` Task outcome; verification is the terminal VERIFY success rate. After a completed SHIP and at least one REVIEW, delivery is `round(100 × (review_count - rework_cycle_count) / review_count)`: first-pass delivery is 100 and every REVIEW that leads directly to corrective PLAN or EXECUTE reduces delivery proportionally. Delivery is otherwise unavailable. Pace is capped at 100 and compares recorded elapsed seconds to the Task's target. All rounding is nearest integer, half-up.

An active Task has a `PROVISIONAL` scorecard result and no composite health score. A closed policy-bound Task has a `FINAL` result; its composite remains unavailable when required verification or shipping evidence is absent. A closed calibration Task returns `UNSCORED`: it retains raw measurements but receives no component or health score. The raw measurements and component scores remain part of every report so IMPROVE work can address a concrete weakness rather than optimize an opaque aggregate.

`--cohort <directory>` recursively evaluates validated YAML Task documents, excludes active Tasks from averages, and calculates equal-weighted closed-Task averages. The score intentionally excludes tokens, model latency, spend, and other host-specific telemetry.

The scorecard policy supplies the target only; it does not change the pace formula or the score weights. ADR-0011 defines derivation, approval, and substitution controls for those policies.

## Context

Elapsed time and rework counts alone show workflow activity but cannot answer whether delivery was accepted and verified. A subjective score would make comparisons dependent on the host or evaluator. We need one stable indicator that combines correctness, delivery flow, and pace while retaining the underlying evidence needed for improvement.

## Consequences

- Tasks bind immutable Story Points in the transition to EXECUTE. A qualifying cohort-derived delivery-time target is bound only when its policy has an entry; no Task chooses an estimate.
- Closed Tasks can be compared individually and in equally weighted cohorts without sharing a runtime or accounting system.
- A low component score points IMPROVE toward acceptance and verification evidence, rework reduction, or pacing rather than treating the composite as a diagnosis.
- Missing evidence or a calibration Task yields `null` component values, not an invented score; consumers must handle `UNSCORED` and incomplete final scorecards.
- Host-specific efficiency and cost measures remain separate, versioned measurements if a host chooses to add them.
