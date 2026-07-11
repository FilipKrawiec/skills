# SDLC Aggregate Schema v1

The SDLC protocol persists aggregate snapshots, not one workflow record. All documents and request/result envelopes use `schema_version: "1"`.

## Layout

```text
.sdlc/
  tasks/<task-id>/task.yaml
  tasks/<task-id>/execution.yaml
  task-links/<task-link-id>.yaml
  artifacts/
```

Every aggregate snapshot has a provider-neutral opaque ID, optimistic-lock `revision`, and append-only `audit` summary. Lightweight hosts generate ULIDs. Tracker IDs are external references.

Resolve `<skill-dir>` to the directory containing the loaded `sdlc/SKILL.md`. Initialize snapshots from `<skill-dir>/assets/task-template.yaml`, `<skill-dir>/assets/task-execution-template.yaml`, and `<skill-dir>/assets/task-link-template.yaml`. Replace every placeholder before validation; the templates are starting points, not additional sources of schema truth. This runtime form is portable across installed plugin hosts and does not assume the target repository contains `plugins/workflow/`.

## Task

Task is the behavior-rich aggregate for requested work.

```yaml
schema_version: '1'
document_type: task
task_id: 01TASK
revision: 2
stage: IN_DEVELOPMENT # DEFINE, SPEC, IN_DEVELOPMENT, IMPROVE, CLOSED
outcome: null         # ACCEPTED, REJECTED, CANCELLED, FAILED only when CLOSED
definition:
  title: Example
  requested_outcome: Deliver the example.
  context: Why it matters.
  initial_scope: []
  external_references: []
specification:
  deliverable: Working example
  completion_condition: Selected sensors pass and shipping finalizes.
  acceptance_criteria: []
  constraints: []
  non_goals: []
  target_repository: owner/repository
  allowed_paths: []
  risks: []
  controls: {}
  budget: {tokens: -1, elapsed_seconds: -1, model_cycles: 12, tool_calls: 24, autonomous_corrections: 3, concurrency: 2}
  collaboration_mode: afk
  max_recovery_tries: 3
execution_slot: {task_execution_id: 01EXEC, status: ACTIVE}
retrospective: null
audit: []
```

Definition changes only in DEFINE, Specification only in SPEC, Execution Slot only in IN_DEVELOPMENT, and Retrospective only in IMPROVE. Leaving a stage freezes its value. Task owns zero or one Task Execution by identity. Within one `.sdlc/` graph, every `task_id` is unique. A non-null Execution Slot must resolve to the Task Execution owned by that Task, and its `task_execution_id` must match exactly.

## Task Execution

Task Execution is a one-to-one dependent aggregate with a distinct identity. It cannot exist without its Task, be reassigned, or be recreated.

States: `ACTIVE`, `WAITING_FOR_HUMAN`, `AWAITING_ACCEPTANCE`, `SUCCEEDED`, `REJECTED`, `FAILED`, `CANCELLED`.

It owns append-only Phase Runs for PLAN, EXECUTE, REVIEW, and SHIP. A transition may append runs but cannot edit, reorder, or remove prior runs. The owning `task_id` is immutable, cumulative usage never decreases, and a terminal Task Execution snapshot is immutable. Run state is operationally `ACTIVE`, `SUCCEEDED`, `FAILED`, or `CANCELLED`; semantic outcomes live in `result`.

Each run identifies the Recovery Window in which it occurred and follows `DEFINE -> EXECUTE -> VERIFY -> IMPROVE -> COMPLETE`:

```yaml
phase_run_id: 01RUN
kind: REVIEW
sequence: 1
state: SUCCEEDED
lifecycle_stage: COMPLETE
cause: broad-review
recovery_window_id: 01WIN
result: {}
improvement:
  strengths: []
  frictions: []
  proposals: []
  evidence_refs: []
artifacts: []
```

Review numbering and limits are scoped to `recovery_window_id`: REVIEW 1 is broad; REVIEW 2 and REVIEW 3 verify prior findings, run deterministic regression sensors, and inspect only the delta since the prior review. A Recovery Window permits at most three REVIEW runs. Human Intervention may create a fresh Recovery Window, whose review count starts again without erasing earlier Phase Runs. Only unresolved HIGH or CRITICAL findings block after REVIEW 3 in a window. Any corrective PLAN or EXECUTE run requires a fresh REVIEW before SHIP.

SHIP uses one Phase Run across candidate preparation, the Acceptance Gate, and finalization. Approval binds to the Candidate Result digest. An unchanged candidate may retain approval through delivery recovery; a changed candidate requires fresh REVIEW and acceptance.

Recovery Windows permit one to three autonomous tries. Review exhaustion rejects execution. SHIP exhaustion, deadline expiry, or resource exhaustion enters `WAITING_FOR_HUMAN`. Human Intervention creates a fresh bounded window without erasing history, Phase Runs, or cumulative usage.

## Task Link

Task Link is an independent aggregate. Its source endpoint, target endpoint, and relationship kind are immutable; its description may change with history. Explicit deletion removes the document and emits audit evidence. Both endpoints must resolve to Tasks in the same `.sdlc/` graph, self-links are invalid, and the graph may contain only one link for a given source, target, and relationship kind.

Kinds: `DERIVATION`, `BLOCKING`, `DEPENDENCY`, `DUPLICATION`, `RELATION`, `IMPLEMENTATION`.

Directional labels are projections of one kind, for example `IMPLEMENTATION` renders `IMPLEMENTS` / `IMPLEMENTED_BY`.

## Shared Envelopes

Phase Request and Phase Result contain `task_id`, `execution_id`, `phase_run_id`, `recovery_window_id`, phase kind/sequence, idempotency key, budget, routing, deadline/cancellation data, and verified Artifact References.

Artifact References contain `artifact_id`, `type`, `revision`, `uri`, and `sha256`. Validate existence, revision, and digest before dispatch.

Work Request/Result exchanges are transient. Persist only reduced findings, usage, audit summaries, and artifact references in the owning Phase Run.

## Profiles

- `LIGHTWEIGHT`: the root agent coordinates through native agent/tool messaging and alone writes aggregate YAML snapshots. It does not emulate an event bus or outbox.
- `HARNESS`: Level 0 coordinates aggregates through at-least-once domain events, a transactional outbox, per-aggregate ordering, and idempotent consumers.

Validate a new snapshot with the bundled script:

```bash
python3 <skill-dir>/scripts/validate-sdlc-document.py <candidate-or-.sdlc-directory>
```

For a mutation, leave the canonical snapshot untouched while creating temporary `<previous>` and `<candidate>` files. Increment `revision`, append the audit entry, then run:

```bash
python3 <skill-dir>/scripts/validate-sdlc-document.py <candidate> --previous <previous>
```

After that succeeds, replace the canonical snapshot with the candidate and validate the `.sdlc/` directory. Delete temporary files only after both checks pass. Never advance workflow state solely in conversation or memory; the persisted canonical snapshot is the resume point.
