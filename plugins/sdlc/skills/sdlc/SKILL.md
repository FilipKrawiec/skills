---
name: sdlc
description: Use when a repository change needs lifecycle coordination, constraints, phase gating, review, or shipping approval.
---

# SDLC Orchestrator

Own lifecycle authorization. Classify the request, select the active phase, enforce its preconditions and constraints, and authorize a transition only after the phase returns valid evidence.

For direct CLI work, keep a compact in-session context and run only the selected phase; do not create SDLC state files or claim cross-session resume. A harness may persist or coordinate the same contract.

| Request state | Action |
| --- | --- |
| Read-only analysis | Report directly; do not start SDLC. |
| Outcome or scope is missing | Invoke `sdlc-define`. |
| Specification is absent or unapproved | Invoke `sdlc-spec`. |
| Approved work lacks a plan | Invoke `sdlc-plan`. |
| Planned work needs delivery or correction | Invoke `sdlc-execute`, then `sdlc-review`. |
| Review passed | Invoke `sdlc-ship`. |
| Delivery has an outcome | Invoke `sdlc-improve`. |

Read [orchestration-contract.md](references/orchestration-contract.md) before authorizing a phase or transition. It validates and supplies the phase envelope. Phase skills are explicit CLI or harness interfaces, not model-discovered entry points.
