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

For every repository-changing request, select its State Authority before DEFINE and use its State Store for every transition. Direct CLI uses the local `.sdlc/` store; a control plane may be authoritative through its revisioned Task API. Never fall back to conversation-only state, and never treat a local mirror as authoritative when a control plane owns the Task. Read [state-store.md](references/state-store.md) before authorizing a repository mutation.

| Request state | Stage skill |
| --- | --- |
| Read-only analysis | Report directly; do not start SDLC. |
| Outcome or scope is missing | `DEFINE` / `sdlc-define` |
| Definition needs an approved delivery contract | `REFINE` / `sdlc-refine` |
| Approved work needs planning, delivery, review, or shipping | `EXECUTE` / `sdlc-execute` |
| Delivery has an outcome | `IMPROVE` / `sdlc-improve`, then terminal `CLOSED` |

Read [orchestration-contract.md](references/orchestration-contract.md) before authorizing a stage or transition. It validates and supplies the stage envelope. Stage skills are explicit CLI or harness interfaces, not model-discovered entry points.
