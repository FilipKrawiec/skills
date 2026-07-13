# IMPROVE Stage Phase

`sdlc-improve` owns the IMPROVE Stage's `IMPROVE` Phase. Its completed Lifecycle result is the retrospective: outcome or rejection reason, strengths, frictions, accepted risks, proposals, follow-up Task IDs, evidence, and an Agentic Diagnosis.

Before completing the Phase, read the current validated Task snapshot, Lifecycle history and results, Artifact References, and its deterministic measurement report. Record a compact Agentic Diagnosis in the completed `COMPLETE` Lifecycle result. It contains non-empty `facts`, zero or more falsifiable `hypotheses`, and exactly one measurable `recommendation`:

```yaml
agentic_diagnosis:
  facts:
    - statement: Directly recorded observation.
      evidence_refs: []
  hypotheses:
    - statement: Possible explanation, not a fact.
      confidence: MEDIUM # LOW, MEDIUM, HIGH
      evidence_refs: []
      disconfirming_check: Observation or measurement that would disprove it.
  recommendation:
    action: One improvement or monitoring action.
    expected_signal: Observable change expected from the action.
    success_criterion: Explicit threshold or event proving success.
```

Facts and hypotheses cite Artifact References whenever they rely on external evidence. A Task snapshot and its measurement report are direct record evidence; neither permits an agent to assert an unobserved causal inference as a fact. Hypotheses may be empty when the evidence does not justify one. In that case the recommendation may be a measurable monitoring action. Do not retain raw/private chain-of-thought or fabricate certainty.

The diagnosis runs before Task closure, so it uses the current raw metrics and `PROVISIONAL` scorecard result only; a calibration Task may have no policy binding. Final component and health scores are derived after `CLOSED`; an unbound closed Task is `UNSCORED`. Later cohort improvement may use those results but must not revise this diagnosis.

Improvement creates evidence and draft Tasks only. A workflow or policy change becomes an independent derived Task linked through `DERIVATION`; it does not execute automatically or silently alter policy. An accepted or rejected Task closes only after the IMPROVE Phase completes and all derived Task Links are persisted.
