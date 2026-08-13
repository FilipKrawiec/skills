# Autonomous Rework Loop & Plan DAG Specification

This reference defines the state machine protocol for autonomous retry loops ($N \le 3$) and Directed Acyclic Graph (DAG) task slice dependency scheduling within the `deliver` workflow.

---

## 1. Plan-Level Dependency DAG Construction

During the **PLAN** phase (Stage 3), the orchestrator decomposes the feature intent into cohesive task slices and computes a **Dependency DAG**:

```
                       ┌─────────────────┐
                       │  Task Slice A   │ (Core Domain Port)
                       └────────┬────────┘
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       ┌──────────────────┐          ┌──────────────────┐
       │   Task Slice B   │          │   Task Slice C   │ (Independent Adapters)
       └────────┬─────────┘          └────────┬─────────┘
                │                             │
                └──────────────┬──────────────┘
                               ▼
                       ┌─────────────────┐
                       │  Task Slice D   │ (Integration Gate)
                       └─────────────────┘
```

### Scheduling Rules

1. **Path Boundary Isolation**: Each task packet MUST explicitly list its `affected_paths`.
2. **Serial Execution**: Tasks with overlapping `affected_paths` or explicit logical dependencies (`depends_on: ["slice-a"]`) MUST be executed serially in order.
3. **Parallel Dispatch**: Tasks with zero `affected_paths` collision and no dependency link MAY be dispatched concurrently across separate Git worktrees.

---

## 2. Autonomous Rework Loop State Machine

During **COLLECT / VERIFY** (Stage 5) and **REVIEW** (Stage 6), the orchestrator operates an **Autonomous Self-Correction Loop** between worker personas (`developer`) and reviewer personas (`quality-engineer`, `solution-architect`, `security-auditor`).

```
    ┌──────────┐      ┌────────────────┐      ┌────────────┐
    │ DISPATCH │ ───► │ COLLECT/VERIFY │ ───► │   REVIEW   │
    └──────────┘      └───────┬────────┘      └─────┬──────┘
         ▲                    │ VERIFICATION        │ REVIEWER REJECTION
         │                    │ FAILED              │ (CORRECT_EXECUTE / CORRECT_PLAN)
         │                    ▼                     ▼
         │             ┌───────────────────────────────────┐
         └──────────── │ Increment attempt_count (N <= 3)  │
                       │ Pass log/diff feedback payload    │
                       └─────────────────┬─────────────────┘
                                         │
                                         │ IF N > max_retries (3)
                                         ▼
                       ┌───────────────────────────────────┐
                       │ ESCALATE TO PRODUCT OWNER (User)  │
                       └───────────────────────────────────┘
```

### Loop Guardrails

1. **Default Retry Ceiling**: `max_retries` defaults to `3`.
2. **Context Payload Handoff**: When a retry occurs, the orchestrator passes the exact test failure output or reviewer correction payload to the executor persona in the next turn.
3. **Escalation Trigger**: If `attempt_count > max_retries`, or if an unrecoverable structural specification failure occurs, the loop stops immediately, logs the failure state in `walkthrough.md`, and returns the decision to the Product Owner (User).
