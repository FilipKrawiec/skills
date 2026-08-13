---
active_skills:
  - ddd
  - hexagonal-architecture
  - tdd
  - vcs
  - deliver

build_tools:
  just:
    build_script: justfile
    lifecycle_tasks:
      unit: just unit
      integration: just integration
      verify: just verify
---

# Repository Rules

## Product Vision & Architecture Invariants
- Control Plane is the single source of truth for state.
- Portal is a stateless configuration UI (no localStorage/sessionStorage persistence).
- Always run `just verify` before publishing a task for review.
