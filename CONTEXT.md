# Context

## Terms

### Task

The aggregate root for work to be delivered. It owns Definition, Specification, Execution Slot, Retrospective, Task Stage, and Task Outcome.

### Definition

The Task-owned value describing requested outcome, context, and initial scope. It changes only during DEFINE.

### Specification

The frozen executable delivery contract containing acceptance, constraints, repository boundary, controls, budget, and collaboration mode. It changes only during SPEC.

### Task Execution

The one-to-one dependent aggregate delivering one Task. It has a distinct identity, cannot exist without Task, cannot be reassigned or recreated, and owns Phase Runs and recovery history.

### Execution Slot

The Task-owned value reserving its Task Execution identity as `REQUESTED` or `ACTIVE`.

### Phase Run

An append-only local entity inside Task Execution representing one PLAN, EXECUTE, REVIEW, or SHIP invocation and its lifecycle, result, evidence, and improvement.

### Recovery Window

A bounded epoch of one to three autonomous tries. Human Intervention may start another window without erasing prior evidence or usage.

### Human Intervention

Immutable human input that resolves, redirects, extends, or rejects work while Task Execution waits for human direction.

### Candidate Result

The exact merge-ready result presented for acceptance after successful review.

### Acceptance Decision

The immutable human approval or rejection bound to a Candidate Result identity and digest.

### Retrospective

The mandatory Task-owned value aggregating outcome, strengths, frictions, usage/cost, recovery, risks, proposals, derived Tasks, and evidence before Task closes.

### Task Link

An aggregate relating two Tasks through a closed relationship kind and required reasoning. Endpoints and kind are stable; description may change; the link may be deleted explicitly.

### Flow Friction

Any failure, retry, recovery, or avoidable delay captured as improvement evidence even when delivery succeeds.

### SDLC Skill Contract

The portable lifecycle and phase behavior defined by the SDLC skills. It is independent of the mechanism that invokes, persists, or coordinates it.

### SDLC Orchestrator

The model-discoverable `sdlc` skill that enforces constraints, authorizes phase transitions, coordinates recovery and review loops, and selects applicable SDLC Phase Skills.

### SDLC Phase Skill

An independently invocable skill for exactly one SDLC phase. It defines that phase's behavior and input/output contract without prescribing a harness implementation.

### SDLC Phase Envelope

The portable input/output contract for a phase invocation. It carries the required orchestration context and returns a proposed result or structured refusal; it cannot authorize a lifecycle transition.

### Harness

An optional implementation that coordinates, persists, or automates the SDLC Skill Contract. It is not required for direct CLI use.
