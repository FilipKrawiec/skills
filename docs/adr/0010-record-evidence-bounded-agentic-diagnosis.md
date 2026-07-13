# ADR-0010: Record Evidence-Bounded Agentic Diagnosis

## Decision

Require the completed IMPROVE Phase to record one structured Agentic Diagnosis. It uses the current validated Task snapshot, Lifecycle history/results, Artifact References, and deterministic measurement report. The record contains non-empty facts, optional falsifiable hypotheses with confidence and a disconfirming check, and one measurable recommendation with an action, expected signal, and success criterion.

The diagnosis is compact operational evidence, not raw/private chain-of-thought. Facts and hypotheses cite Artifact References when they rely on external evidence. An agent may record no hypotheses and recommend monitoring when causal explanation is not justified. Workflow and policy changes become derived Tasks with `DERIVATION` Task Links.

IMPROVE occurs before the terminal Task state. It therefore uses raw metrics and the active Task's provisional scorecard result; a calibration Task may have no bound scorecard. Final scorecard values are derived after `CLOSED` and do not rewrite the diagnosis.

## Context

The deterministic health score shows what happened, but cannot by itself say what to change. Letting agents provide unconstrained prose would blur measurement, inference, and private reasoning, while requiring a causal diagnosis for every Task would encourage fabricated certainty. The realistic alternatives are a score-only retrospective, unrestricted narrative, or a small falsifiable evidence record.

## Consequences

- IMPROVE can turn measured evidence into a testable next action without treating a score as a cause.
- Future agents can inspect the fact/hypothesis boundary and disconfirming checks instead of debugging an opaque narrative.
- The schema and validation contract become stricter for completed IMPROVE work.
- Diagnosis is necessarily pre-close; final cohort analysis may create a later derived Task rather than mutate a completed Task.
