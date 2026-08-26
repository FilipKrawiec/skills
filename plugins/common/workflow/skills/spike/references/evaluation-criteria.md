# Spike Promotion vs. Discard Rubric

Use this evaluation rubric to determine the exit gate of an exploratory spike before committing changes.

## 1. Decision Matrix

| Dimension | Promote to Specification (`tdd`) | Discard & Log Decision Record |
| :--- | :--- | :--- |
| **Hypothesis Verification** | Target capability proven with observable evidence. | Capability unsupported or introduces fatal flaws. |
| **API Ergonomics** | Cleanly adapts into domain/ports boundaries. | Leaks heavy framework dependencies across domain. |
| **Performance / Latency** | Meets target operational thresholds. | Breaches latency or memory budgets. |
| **Dependency Footprint** | Stable dependencies with active maintenance. | Unmaintained, insecure, or heavy transitive bloat. |
| **Failure Modes** | Predictable error handling and recovery paths. | Opaque exceptions or non-deterministic crashes. |

---

## 2. Clean-Room Promotion Standard

When a spike is **promoted**:
- Treat spike code as a disposable laboratory prototype.
- Extract API contracts, tested behaviors, and edge cases into the task specification.
- Write production code from scratch using Chicago-style `tdd` to ensure proper layer encapsulation and test isolation.

---

## 3. Discard & Knowledge Capture Standard

When a spike is **discarded**:
- Document the exact reason for rejection (e.g., concurrency deadlock, missing API features, or excessive bundle size).
- Commit a brief Architecture Decision Record (ADR) or note to preserve the negative result.
- Clean up temporary branches and throwaway test fixtures.
