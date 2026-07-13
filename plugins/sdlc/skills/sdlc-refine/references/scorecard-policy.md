# Story Points and Scorecard Policy

Before REFINE approval, help the human select exactly one Story Points value: `1`, `2`, `3`, `5`, or `8`. Select a relative work-size class, not a calendar duration. Do not estimate, negotiate, or write `target_elapsed_seconds`.

The Task holds `classification: null` and `scorecard: null` through DEFINE and REFINE. After the human approves REFINE, root `sdlc` appends EXECUTE and atomically binds:

```yaml
classification:
  story_points: 3
```

The classification is immutable. It records the approved points even when no historical baseline exists.

If a published policy has the chosen points, root runs the policy resolver and copies the returned `scorecard` envelope into the Task. This is a policy-bound Task. The envelope records the policy ID, its raw-byte SHA-256, Story Points, P75 elapsed target, and sample size; it is immutable and must validate against the retained policy file.

If the policy has no entry, root appends EXECUTE with `scorecard: null`. This is calibration, not an error: the closed Task retains raw timing, review, rework, and verification evidence for future P75 derivation, but has no pace or composite health score.

After approval, do not reclassify the Task, edit a binding, or invent a target. Record a classification mistake as IMPROVE evidence and create a derived follow-up Task when correction is needed. A policy maintainer—not the Task agent—publishes a new versioned policy after a sufficiently sampled closed Story Points cohort exists.
