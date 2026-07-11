---
name: sdlc
description: "Use when modifying repository files through a bounded agentic development harness: define and specify the task, execute a reviewed delivery, gate shipping, and preserve structured improvement evidence."
---

# SDLC

Run delivery as behavior over Task, Task Execution, and Task Link aggregates. `LIGHTWEIGHT` uses native agent/tool messaging and YAML snapshots; `HARNESS` supplies explicit Level 0 orchestration. Both preserve the same domain invariants.

Classify the request first. `analysis-only` reads and reports without documents. `plan-only` creates only the requested plan artifact. `bounded-change` and `full-delivery` use the aggregate protocol. `workflow-maintenance` is an explicitly authorized bootstrap mode for repairing these controls without recursively invoking them.

## Task Stages

Task follows `DEFINE -> SPEC -> IN_DEVELOPMENT -> IMPROVE -> CLOSED`.

1. DEFINE creates the Definition once. Read [phase-define.md](references/phase-define.md).
2. SPEC collaborates with the human, freezes the Specification on approval, and authorizes the one Task Execution. Read [phase-spec.md](references/phase-spec.md).
3. IN_DEVELOPMENT runs PLAN, EXECUTE, REVIEW, and SHIP as append-only Phase Runs. Read [phase-plan.md](references/phase-plan.md) for PLAN, [phase-execute.md](references/phase-execute.md) for EXECUTE, [phase-review.md](references/phase-review.md) for REVIEW, and [phase-ship.md](references/phase-ship.md) for SHIP.
4. IMPROVE creates the mandatory Retrospective, including strengths, frictions, usage/cost, recovery history, risks, proposals, and any derived Tasks. Read [phase-improve.md](references/phase-improve.md).
5. CLOSED records `ACCEPTED`, `REJECTED`, `CANCELLED`, or `FAILED` only after Retrospective and derived Tasks are persisted.

Definition, Specification, and Retrospective are one-shot Task-owned values. Never reopen a frozen value. If work cannot finish under its Specification, close with learning and derive a linked Task for HIL SPEC.

## Task Execution

Task owns zero or one dependent Task Execution by identity. The root coordinator reserves its ID with `TaskExecutionRequested`; duplicate handling must not create another execution.

Task Execution owns Phase Runs for PLAN, EXECUTE, REVIEW, and SHIP. Each Phase Run receives a compact Phase Request, uses only required Artifact References, and returns one validated Phase Result. Children never mutate aggregate documents or inherit the parent transcript.

Use Resource Budgets selected by task need. `-1` means unlimited, `0` no capacity, and positive values finite limits; concurrency must be positive and finite. A Recovery Window permits one to three autonomous tries.

Read [multi-agent-negotiation.md](references/multi-agent-negotiation.md) for review correction, recovery exhaustion, and HIL intervention.

## Acceptance and Improvement

REVIEW 1 is the only broad review. Later reviews verify prior findings and delta-introduced regressions. SHIP may start only from the latest successful review.

One SHIP Phase Run prepares the Candidate Result, waits at the single Acceptance Gate, and finalizes shipping after approval. Approval binds to the candidate digest. Rejection moves Task to IMPROVE.

Every Phase Run emits strengths, frictions, proposals, and evidence. Improvement never silently edits workflow assets; it derives independent Tasks linked through Task Link aggregates.

## Persistence

Read [state-schema.md](references/state-schema.md) before creating or updating aggregate documents. In `LIGHTWEIGHT`, only the root agent writes `.sdlc/` snapshots. Resolve the directory containing this loaded `SKILL.md` as `<skill-dir>`; use its bundled `assets/` and `scripts/` rather than assuming the target repository contains plugin source files.

Persist every aggregate mutation before continuing, including Task stage changes, Execution Slot changes, Phase Run lifecycle/result changes, recovery or usage updates, acceptance, Retrospective, and Task Link changes:

1. For a new aggregate, build a candidate from the bundled template, validate it, then place it at the canonical `.sdlc/` path.
2. For an existing aggregate, preserve the current snapshot as a temporary previous file, write the next revision to a temporary candidate, and validate the candidate with `--previous`.
3. Replace the canonical snapshot only after validation succeeds, then validate the complete `.sdlc/` graph. On failure, keep the canonical snapshot unchanged and repair the candidate.
4. Do not start the next lifecycle step, dispatch work, or request approval until the corresponding snapshot is persisted. Large artifacts remain external and digest-verified.

Before any human approval request, show the current outcome, affected components, verification status, risks/recovery history, exact Candidate Result, and the effect approval permits.
