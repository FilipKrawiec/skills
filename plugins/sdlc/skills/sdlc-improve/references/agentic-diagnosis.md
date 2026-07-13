# Agentic Diagnosis

Use the current validated Task snapshot as the source record. Inspect its Lifecycle history and compact results, Artifact References, and the deterministic measurement report for that exact revision. The report is evidence, not the conclusion.

Produce a concise, structured diagnosis in the completed IMPROVE result:

```yaml
agentic_diagnosis:
  facts:
    - statement: A directly recorded observation.
      evidence_refs: [] # Artifact References when the fact relies on external evidence
  hypotheses:
    - statement: A possible explanation, explicitly not a fact.
      confidence: MEDIUM # LOW, MEDIUM, or HIGH
      evidence_refs: [] # Artifact References when external evidence supports it
      disconfirming_check: A concrete observation or measurement that could disprove it.
  recommendation:
    action: One measurable improvement or monitoring action.
    expected_signal: The observed change that should follow.
    success_criterion: The explicit threshold or event that determines success.
```

`facts` is non-empty. A fact may cite the Task snapshot or deterministic report implicitly; when it depends on an external artifact, attach that Artifact Reference. `hypotheses` may be empty. Do not invent a hypothesis, causal story, confidence, or certainty when evidence does not support one; use a monitoring recommendation instead.

The diagnosis occurs while the Task is still active. It uses the current raw metrics and the provisional scorecard result; a calibration Task may have no policy binding. A final score is derived only after terminal `CLOSED` for a policy-bound Task; an unbound closed Task is `UNSCORED`. Do not retroactively rewrite the diagnosis to fit the final score.

Give exactly one recommendation. It must be actionable and measurable, including when the appropriate action is to monitor a suspected issue. Create a derived Task and `DERIVATION` Task Link for a workflow or policy change; do not silently alter a policy, baseline, or skill. The stage result can propose that follow-up but cannot authorize it.

Do not include private chain-of-thought, hidden prompts, or a transcript. Preserve only the compact facts, falsifiable hypotheses, and recommendation needed for future improvement.
