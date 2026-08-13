---
name: guide
description: Use when determining which skill, workflow, or delivery loop fits your current task.
disable-model-invocation: true
---

# Workflow Navigator & Intent Router

Select the optimal path across the repository's Dual-Speed Flow Topology based on your immediate engineering goal.

## Dual-Speed Flow Topology

```
                         ┌──────────────────────────────┐
                         │   INCOMING TASK / PROBLEM    │
                         └──────────────┬───────────────┘
                                        │
                               ┌────────▼────────┐
                               │  guide (Router) │
                               └────────┬────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │                                                     │
             ▼ (Fast Tactical Loop)                                ▼ (Enterprise Delivery Loop)
  ┌──────────────────────────────┐                      ┌──────────────────────────────┐
  │ 1. triage (Red signal & cut) │                      │ 1. define (Outcomes & Scope) │
  │ 2. tdd (Chicago Red-Green)   │                      │ 2. specify/grill-with-context│
  │ 3. review (Smell & Spec)     │                      │ 3. deliver                   │
  │ 4. vcs (Atomic commit)       │                      │    (Worktree multi-agent)    │
  └──────────────┬───────────────┘                      │ 4. project-verify.py (Gates) │
                 │                                      │ 5. Review Request & Ship     │
                 │                                      └──────────────┬───────────────┘
                 │                                                     │
                 └──────────────────────┬──────────────────────────────┘
                                        ▼
                   ┌────────────────────────────────────────┐
                   │    ARCHITECTURAL DOCTRINES (ON DEMAND) │
                   │  • ddd (Aggregates, Events, Terms)     │
                   │  • hexagonal-architecture (Ports)      │
                   └────────────────────────────────────────┘
```

## Routing Matrix

| Goal / Situation | Recommended Path | Primary Skills |
| :--- | :--- | :--- |
| **Bug / Broken Test / Regression** | Tactical Fast Loop | `triage` ➔ `tdd` ➔ `review` ➔ `vcs` |
| **Feature Slice / Pure Code TDD** | Tactical Fast Loop | `tdd` ➔ `review` ➔ `vcs` |
| **Code Review / PR Diff Audit** | Tactical Fast Loop | `review` |
| **Commit / Branch / Rebase / Push** | Tactical Fast Loop | `vcs` |
| **New Business Outcome / B2B Epics** | Enterprise Delivery Loop | `define` ➔ `specify` ➔ `deliver` |
| **Design Domain Aggregates / Language**| Architecture Doctrine | `ddd` |
| **Design Ports, Adapters, Boundaries**| Architecture Doctrine | `hexagonal-architecture` |
| **Scaffold Monorepo Infrastructure** | Orchestration Suite | `scaffold-monorepo` |
| **Strategic Codebase Health Audit** | Authoring Suite | `swot` |
| **Recover from Confused Agent State** | Recovery Workflow | `rephrase` |

## Output Envelope

```text
➡️ Recommended Flow: **[Fast Tactical Loop | Enterprise Delivery Loop | Architecture Doctrine]**
➡️ Entry Skill: `skill-name`
➡️ Next Step: <1-sentence actionable command or question>
```
