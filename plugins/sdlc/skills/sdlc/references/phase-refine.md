# REFINE Stage Phase

`sdlc-refine` owns the REFINE Stage's `REFINE` Phase. Collaborate with the human to produce the executable Specification: deliverable, completion condition, acceptance criteria, constraints, non-goals, repository boundary, risks, controls, resource budget, collaboration mode, and recovery controls.

Human approval completes the REFINE Phase Lifecycle. Its result is the approved Specification; it is immutable and is read by later EXECUTE Phases through the Task hierarchy. REFINE then requests the EXECUTE Stage. Do not reserve a separate execution aggregate or copy the Specification to a top-level Task field.

Before that approval, a human also approves the Task's Story Points: exactly one of `1`, `2`, `3`, `5`, or `8`. The Task retains `classification: null` and `scorecard: null` through REFINE. In the approved root transition that appends EXECUTE, bind `{story_points}`. When the immutable versioned policy has a matching entry, resolve it and copy the exact resolver output into the Task; otherwise append EXECUTE with `scorecard: null` as calibration. Validate the complete `.sdlc` graph before delivery work. The Task agent never supplies a duration target. After binding, do not reclassify the Task or change a policy reference; record a mistake as IMPROVE evidence and create a derived follow-up Task when correction is needed.
