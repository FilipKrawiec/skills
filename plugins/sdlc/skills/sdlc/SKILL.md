---
name: sdlc
description: Use when a repository change needs lifecycle coordination, constraints, phase gating, review, or shipping approval.
---

# SDLC Orchestrator

Own lifecycle authorization. Classify the request, select the active phase, enforce its preconditions and constraints, and authorize a transition only after the phase returns valid evidence.

For direct CLI work, keep a compact in-session context and run only the selected phase; do not create SDLC state files or claim cross-session resume. A harness may persist or coordinate the same contract.

Use `sdlc-define`, `sdlc-spec`, `sdlc-plan`, `sdlc-execute`, `sdlc-review`, `sdlc-ship`, and `sdlc-improve` as the phase interfaces. Read [orchestration-contract.md](references/orchestration-contract.md) before authorizing a phase or transition.
