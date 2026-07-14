# Context

## Terms

### Task

The aggregate root for one requested outcome. It owns an ordered list of Stages, terminal outcome, revision, and audit. Its record shape is `Task → Stage[] → Phase[] → Lifecycle[]`.

### Stage

An append-only Task entity that maps one SDLC stage to its stage skill. Stage kinds are `DEFINE`, `REFINE`, `EXECUTE`, and `IMPROVE`; `CLOSED` is the Task's terminal state, not a Stage. A Stage owns an ordered list of Phases.

### Phase

One occurrence of stage-owned work. DEFINE, REFINE, and IMPROVE each own one same-named Phase. EXECUTE owns an ordered path of PLAN, EXECUTE, REVIEW, and SHIP Phases; REVIEW may append PLAN or EXECUTE corrections before SHIP. A Phase owns an ordered list of shared Lifecycle steps.

### Lifecycle

One root-defined step within a Phase: `DEFINE → EXECUTE → VERIFY → IMPROVE → COMPLETE`. A Lifecycle records state, RFC3339 start and completion timestamps, compact result, improvement evidence, and Artifact References. `ACTIVE` has no completion timestamp; all terminal states have one strictly after their start. Lifecycle intervals in a Phase are ordered and non-overlapping. Completed Lifecycle entries are immutable.

### Definition

The completed Lifecycle result of the DEFINE Stage's DEFINE Phase. It describes requested outcome, context, initial scope, and external references. It is not a top-level Task value.

### Specification

The completed Lifecycle result of the REFINE Stage's REFINE Phase. It is the approved executable delivery contract: acceptance, constraints, repository boundary, controls, budget, and collaboration mode. It is not a top-level Task value.

### Retrospective

The completed Lifecycle result of the IMPROVE Stage's IMPROVE Phase. It aggregates outcome, strengths, frictions, risks, proposals, follow-up Tasks, evidence, and the required Agentic Diagnosis before the Task closes.

### Agentic Diagnosis

A compact, evidence-bounded interpretation produced during IMPROVE from the current validated Task snapshot, its lifecycle history/results and Artifact References, and the deterministic measurement report for that revision. It has non-empty facts, optional falsifiable hypotheses with confidence and a disconfirming check, and exactly one measurable recommendation. It is not private chain-of-thought, does not assert inference as fact, and may honestly contain no hypotheses when monitoring is the proper action. It uses pre-close raw/provisional evidence; final scorecard values are derived only after `CLOSED`.

### Artifact Reference

A verified reference to a large document, patch, log, or report. It has an ID, type, revision, URI, and SHA-256 digest and is attached to the Lifecycle that produced it.

### Candidate Result

The exact merge-ready result presented for acceptance after a successful REVIEW. Its approval is bound to its artifact identity and digest.

### Acceptance Decision

The immutable human approval or rejection bound to a Candidate Result identity and digest.

### Task Link

An aggregate relating two Tasks through a closed relationship kind and required reasoning. Endpoints and kind are stable; description may change; the link may be deleted explicitly.

### Flow Friction

Any failure, correction, recovery, or avoidable delay captured as Lifecycle improvement evidence even when delivery succeeds.

### Deterministic SDLC Measurement

A reproducible JSON report derived only from a validated Task snapshot's timestamps and append-only Stage/Phase/Lifecycle history. It retains raw elapsed, structural, verification, review, and rework metrics as evidence. IMPROVE uses the active Task's raw/provisional report in its Agentic Diagnosis; it does not wait for or invent a final score. A closed Task also produces a final SDLC Health Score using an immutable policy-resolved pace baseline. The same command can report an equal-weighted cohort of closed Task scorecards. It excludes subjective, model-dependent, and host-cost metrics.

### Story Points Classification

The immutable `{story_points}` Task classification selected during REFINE from the allowed Fibonacci-like values `1`, `2`, `3`, `5`, or `8`. It is `null` through DEFINE and REFINE. Root `sdlc` writes it only in the approved transition that appends EXECUTE; it is never a duration estimate and never changes afterwards.

### Scorecard Policy

An immutable, versioned document that derives one P75 elapsed-time baseline for each sufficiently sampled Story Points group in a closed Task cohort. Its raw-byte SHA-256 is copied into a policy-bound Task scorecard so graph validation detects policy substitution. A new baseline is a new policy ID, not an edit to a published policy.

### Scorecard Binding

The immutable five-field Task value resolved from a Scorecard Policy: policy ID, raw-byte SHA-256, approved Story Points, resolved P75 target elapsed seconds, and baseline sample size. “Bound” means root `sdlc` copied the resolver's exact `scorecard` envelope into the Task in the approved REFINE-to-EXECUTE transition. A Task may instead enter calibration: its Story Points Classification is bound but its `scorecard` stays `null` until a policy has an entry for those points. Task agents neither estimate a target nor reclassify an approved Task.

### SDLC Health Score

A bounded, deterministic composite used to summarize the correctness, delivery, and pace of one closed Task or an equal-weighted cohort of closed Tasks. Its component scores remain visible so IMPROVE work can target the weakest evidence-backed dimension rather than optimize a single opaque number.

### SDLC Skill Contract

The portable stage, phase, and lifecycle behavior defined by the SDLC skills. It is independent of the mechanism that invokes, persists, or coordinates it.

### SDLC Orchestrator

The model-discoverable `sdlc` skill that enforces constraints, authorizes stage and phase transitions, coordinates review and recovery loops, and selects applicable SDLC Stage Skills. It owns the shared Lifecycle.

### SDLC Stage Skill

An explicitly invocable skill for one Stage: `sdlc-define`, `sdlc-refine`, `sdlc-execute`, or `sdlc-improve`. It defines stage-owned Phases and returns a proposed result or structured refusal; it cannot authorize a transition.

### SDLC Stage Envelope

The portable input/output contract for a Stage invocation. It carries Task, Stage, active Phase and Lifecycle context, constraints, evidence, and required approval material. It returns a proposed result or structured refusal; it cannot authorize a transition.

### State Authority

The one durable system of record for an SDLC Task. A repository-changing Task must have exactly one State Authority: the local file-backed `.sdlc/` store for direct CLI work, or a revisioned control-plane store for harnessed work. A mirror or cache is never a second authority.

### State Store

The port through which root `sdlc` loads, validates, and atomically transitions a Task at its State Authority. It supplies an active snapshot and accepts a revision-checked proposed transition. Root refuses repository changes when this port is unavailable, stale, or rejects the transition.

### State Projection

A non-authoritative materialized view of control-plane state, such as a local `.sdlc/` cache. It aids inspection and tooling but cannot authorize work or accept transitions.

### Harness

An implementation that coordinates or automates the SDLC Skill Contract through a control-plane State Authority. It may use ordered idempotent events and an outbox, but preserves the portable Task hierarchy and revision-checked transitions.
