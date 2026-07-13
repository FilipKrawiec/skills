# Deterministic SDLC Measurement and Health Score

Measure a completed or in-progress Task from its validated schema-version-1 YAML snapshot:

```bash
python3 <skill-dir>/scripts/measure-sdlc-performance.py <task.yaml>
```

The command validates a `task` document, writes one sorted-key JSON object, and never changes the snapshot. The same snapshot always produces the same raw metrics and scorecard result.

## Measurement input

Every Lifecycle provides portable timing evidence: `started_at` is an RFC3339 timestamp with timezone; `completed_at` is `null` for `ACTIVE` and a later RFC3339 timestamp for a terminal Lifecycle. Within a Phase, lifecycles are ordered and do not overlap.

Tasks have `classification: null` and `scorecard: null` through DEFINE and REFINE. On the approved REFINE-to-EXECUTE transition, root `sdlc` binds the human-approved Story Points classification:

```yaml
classification:
  story_points: 3 # exactly one of 1, 2, 3, 5, 8
```

If a published policy has an entry for those points, root invokes the resolver and copies its exact `scorecard` envelope into the same transition. This is what “policy bound” means. The envelope contains `policy_id`, `policy_sha256`, `story_points`, `target_elapsed_seconds`, and `baseline_sample_size`. It is immutable. Story Points and the P75 target are not estimates chosen by the Task agent.

If no policy entry exists, root writes only `classification` and leaves `scorecard: null`. That Task is calibration work: it retains its raw evidence and may contribute to a later policy, but it has no pace or composite health score.

## Pace-baseline policy

A policy maintainer derives an immutable, versioned `scorecard_policy` from closed Tasks with a bound Story Points classification. For each Story Points group, sort elapsed seconds and select the item at rank `ceil(3n / 4)` as P75. Only groups with `n >= minimum_sample_size` receive an entry.

```bash
python3 <skill-dir>/scripts/derive-sdlc-scorecard-policy.py \
  --cohort .sdlc/history \
  --policy-id delivery-baseline-2026-q3 \
  --minimum-sample-size 4 \
  --occurred-at 2026-07-13T09:00:00Z \
  --output .sdlc/scorecard-policies/delivery-baseline-2026-q3.yaml
```

Published policies are never edited. A changed cohort or rule has a new `policy_id`. The Task scorecard's raw-byte policy SHA-256 lets complete `.sdlc` validation detect a replaced or reserialized policy. Resolution is the only supported way to make a non-null scorecard:

```bash
python3 <skill-dir>/scripts/resolve-sdlc-scorecard-policy.py \
  .sdlc/scorecard-policies/delivery-baseline-2026-q3.yaml 3
```

The resolver emits both `classification` and `scorecard`. Root copies both when its policy has the entry; otherwise it copies the approved classification alone for calibration. Do not alter Story Points, choose a duration, or edit a bound scorecard after approval. Record an incorrect classification as IMPROVE evidence and create a derived follow-up Task when correction is needed.

## Raw evidence metrics

| Field | Definition |
| --- | --- |
| `elapsed_seconds` | Whole seconds from the earliest Lifecycle `started_at` to the latest observed timestamp; completed Lifecycles contribute `completed_at`, active ones contribute `started_at`. |
| `stage_count` | Number of Task Stages. |
| `phase_count` | Number of Phases across all Stages. |
| `lifecycle_count` | Number of Lifecycle entries across all Phases. |
| `completed_phase_count` | Phases whose final Lifecycle is `COMPLETE` and `SUCCEEDED`. |
| `review_count` | `REVIEW` Phases in the EXECUTE Stage path. |
| `rework_cycle_count` | Adjacent EXECUTE-Stage pairs where `REVIEW` is followed by `PLAN` or `EXECUTE`. |
| `first_pass_delivery` | `null` until a SHIP Phase completes; then `true` when rework is zero, otherwise `false`. |
| `verification_success_rate` | Successful terminal VERIFY Lifecycles divided by all terminal VERIFY Lifecycles; `null` when none are terminal. |

Actual append-only history remains visible: corrected PLAN or EXECUTE phases are not collapsed. Use raw evidence in the pre-close IMPROVE Agentic Diagnosis; a score is a steering signal, not a causal conclusion.

## Task scorecard

All component scores are integers from 0 through 100. `round(n / d)` means nearest-integer, half-up.

An active Task returns `status: PROVISIONAL`. Its verification score may exist, but acceptance, correctness, delivery, pace, and health are `null`; no active Task receives a composite score.

A closed Task with a non-null policy-bound scorecard returns `status: FINAL`:

| Score | Formula |
| --- | --- |
| `acceptance_score` (`A`) | `100` when `outcome` is `ACCEPTED`; otherwise `0`. |
| `verification_score` (`V`) | `round(100 × succeeded terminal VERIFY / all terminal VERIFY)`; `null` when none exist. |
| `correctness_score` (`C`) | `round((70 × A + 30 × V) / 100)`; `null` when `V` is `null`. |
| `delivery_score` (`D`) | `round(100 × (review_count - rework_cycle_count) / review_count)` after completed SHIP and at least one review; otherwise `null`. |
| `pace_score` (`P`) | `round(100 × min(target_elapsed_seconds, elapsed_seconds) / elapsed_seconds)`. |
| `sdlc_health_score` (`H`) | `round((50 × C + 30 × D + 20 × P) / 100)`, or `null` when a component is `null`. |

Correctness weighs acceptance at 70% and verification at 30%; health weighs correctness at 50%, delivery at 30%, and pace at 20%. Missing evidence stays `null`, never an invented zero.

A closed Task with `scorecard: null` returns `status: UNSCORED`, null component and health values, and all raw metrics. It is calibration evidence, not a failed or ignored Task.

## Cohorts

```bash
python3 <skill-dir>/scripts/measure-sdlc-performance.py --cohort <directory>
```

The command validates YAML below the directory, excludes `artifacts` paths, considers only Task documents, and excludes active Tasks from averages. `closed_task_count` includes `UNSCORED` calibration Tasks. For health, correctness, delivery, and pace, the command returns a nearest-integer, half-up arithmetic mean of non-null closed-Task values. Each scored Task has equal weight; size, duration, and phase count do not increase influence.

## Deliberate exclusions

The portable score uses validated Task-record evidence only. It excludes subjective ratings, model-dependent success estimates, tokens, model latency, tool price, currency cost, and other host-specific telemetry. A host may retain a report as an Artifact Reference with the source Task revision and digest, but the report is derived evidence, not a mutable Task field.
