---
name: sdlc
description: Use when a repository change needs lifecycle coordination, constraints, phase gating, review, or shipping approval.
---

# SDLC Orchestrator

Own lifecycle authorization. Classify the request, locate its active stage, enforce preconditions and constraints, and authorize a stage transition only after its stage skill returns valid evidence.

## Shared Phase Lifecycle

Every stage skill manages its own stage details through this root-owned lifecycle. Do not duplicate it in stage skills.

```text
DEFINE -> EXECUTE -> VERIFY -> IMPROVE -> COMPLETE
```

## Stages

Capitalized labels are stages; each maps to one stage skill. `CLOSED` is a terminal state, not a stage or skill.

```text
DEFINE
  sdlc-define
REFINE
  sdlc-refine
EXECUTE
  sdlc-execute
    PLAN -> EXECUTE -> REVIEW -> SHIP
IMPROVE
  sdlc-improve
CLOSED (terminal state)
```

For direct CLI work, keep a compact in-session context and run the selected active stage and phase; do not create SDLC state files or claim cross-session resume. A harness may persist or coordinate the same contract.

| Request state | Stage skill |
| --- | --- |
| Read-only analysis | Report directly; do not start SDLC. |
| Outcome or scope is missing | `DEFINE` / `sdlc-define` |
| Definition needs an approved delivery contract | `REFINE` / `sdlc-refine` |
| Approved work needs planning, delivery, review, or shipping | `EXECUTE` / `sdlc-execute` |
| Delivery has an outcome | `IMPROVE` / `sdlc-improve`, then terminal `CLOSED` |

Read [orchestration-contract.md](references/orchestration-contract.md) before authorizing a stage or transition. It validates and supplies the stage envelope. Stage skills are explicit CLI or harness interfaces, not model-discovered entry points.
