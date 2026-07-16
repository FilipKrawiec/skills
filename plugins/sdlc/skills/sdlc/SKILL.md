---
name: sdlc
description: Use when a repository change needs lifecycle coordination, constraints, phase gating, review, or shipping approval.
---

# SDLC Orchestrator

Own lifecycle authorization. Classify the request, locate its active stage, enforce preconditions and constraints, and authorize a stage transition only after its stage skill returns valid evidence.

## Lifecycle model

The persisted hierarchy has three distinct levels. A Stage never uses the shared Lifecycle names as aliases.

```text
Task
├── Stage: DEFINE -> REFINE -> EXECUTE -> IMPROVE
│   └── Phase: stage-owned work; EXECUTE uses PLAN -> EXECUTE -> REVIEW -> SHIP
│       └── Lifecycle: DEFINE -> EXECUTE -> VERIFY -> IMPROVE -> COMPLETE
└── CLOSED: terminal Task state
```

Each capitalized Stage maps to its stage skill: `sdlc-define`, `sdlc-refine`, `sdlc-execute`, or `sdlc-improve`. `sdlc` owns lifecycle authorization; a stage skill proposes evidence but never authorizes a transition.

For every repository-changing request, select its State Authority before DEFINE and use its State Store for every transition. Direct CLI uses the local `.sdlc/` store; a control plane may be authoritative through its revisioned Task API. Never fall back to conversation-only state, and never treat a local mirror as authoritative when a control plane owns the Task.

| Request state | Stage skill |
| --- | --- |
| Read-only analysis | Report directly; do not start SDLC. |
| Outcome or scope is missing | `DEFINE` / `sdlc-define` |
| Definition needs an approved delivery contract | `REFINE` / `sdlc-refine` |
| Approved work needs planning, delivery, review, or shipping | `EXECUTE` / `sdlc-execute` |
| Delivery has an outcome | `IMPROVE` / `sdlc-improve`, then terminal `CLOSED` |

Stage skills are explicit CLI or harness interfaces, not model-discovered entry points.

## Context pointers

- Read [orchestration-contract.md](references/orchestration-contract.md) before authorizing a stage or transition.
- Read [state-store.md](references/state-store.md) before selecting an authority or authorizing a repository mutation.
- Read [state-schema.md](references/state-schema.md) when initializing, transitioning, or validating file-backed Task records.
- Read [formats.md](references/formats.md) when recording phase results or artifact references.
- Read [performance-measurement.md](references/performance-measurement.md) when resolving a scorecard policy or measuring a Task or cohort.
