# SDLC Task Schema v1

The SDLC protocol persists one **Task** aggregate and optional Task Links. A Task records work in the same hierarchy used by the SDLC skills:

```text
Task
└── Stage[]       DEFINE → REFINE → EXECUTE → IMPROVE
    └── Phase[]   stage-owned work
        └── Lifecycle[]  DEFINE → EXECUTE → VERIFY → IMPROVE → COMPLETE
```

`CLOSED` is a terminal Task state, not a Stage. Root `sdlc` owns the shared lifecycle. The stage skill owns its Phases; it must not redefine lifecycle names or ordering.

All documents use `schema_version: '1'`. This is the only supported persisted contract. A snapshot has an opaque ID, optimistic-lock `revision`, and append-only `audit` summary. Lightweight hosts generate ULIDs; tracker IDs are external references.

## Layout

```text
.sdlc/
  tasks/<task-id>/task.yaml
  scorecard-policies/<versioned-policy-id>.yaml
  task-links/<task-link-id>.yaml
  artifacts/
```

Resolve `<skill-dir>` to the directory containing the loaded `sdlc/SKILL.md`. Initialize a Task from `<skill-dir>/assets/task-template.yaml`, a scorecard policy from `<skill-dir>/assets/scorecard-policy-template.yaml`, and a Task Link from `<skill-dir>/assets/task-link-template.yaml`. Replace every placeholder before validation. Templates are starting points, not additional schema sources. This runtime form is portable across installed plugin hosts and does not assume the target repository contains `plugins/workflow/`.

## Task

Task is the aggregate for one requested outcome. It owns the ordered Stage history and terminal outcome. It does not duplicate Definition, Specification, or a retrospective at the top level: those are results of the relevant completed lifecycles.

```yaml
schema_version: '1'
document_type: task
task_id: 01TASK
revision: 2
state: ACTIVE # ACTIVE or CLOSED
outcome: null # ACCEPTED, REJECTED, CANCELLED, FAILED only when CLOSED
classification: null # `{story_points}` binds only when approved REFINE appends EXECUTE
scorecard: null # optional policy binding; null means calibration
stages:
  - stage_id: 01STAGE
    kind: DEFINE
    sequence: 1
    phases:
      - phase_id: 01PHASE
        kind: DEFINE
        sequence: 1
        lifecycles:
          - lifecycle_id: 01LIFECYCLE
            kind: DEFINE
            sequence: 1
            state: ACTIVE
            started_at: 2026-07-13T09:00:00Z
            completed_at: null
            result: null
            improvement: null
            artifacts: []
audit: []
```

Stages append in this order: `DEFINE`, `REFINE`, `EXECUTE`, `IMPROVE`. A Stage is complete only after all of its Phases are complete. A completed Stage is immutable. `ACCEPTED` and `REJECTED` Tasks become `CLOSED` only after a completed `IMPROVE` Stage. A `FAILED` or `CANCELLED` Task may instead close from its current Stage when that Stage's current Phase ends in the matching failed or cancelled Lifecycle.

### Story Points classification and scorecard binding

`classification` and `scorecard` are `null` while a Task is in DEFINE or REFINE. In the approved transition that appends EXECUTE after completed REFINE, root `sdlc` binds the approved classification exactly once:

```yaml
classification:
  story_points: 3 # one of 1, 2, 3, 5, 8
```

If a published policy contains that Story Points entry, root obtains the resolver's exact envelope and records its `scorecard` before delivery work. “Policy bound” means this copy has happened; it does not mean that an agent chose or negotiated a delivery duration. If no policy entry exists, root still appends EXECUTE with the classification but leaves `scorecard: null`. That Task is calibration work: it contributes raw evidence to a later policy but has no pace or composite health score.

Do not construct a scorecard manually or accept a task-agent estimate. A non-null scorecard has exactly these fields:

| Field | Meaning |
| --- | --- |
| `policy_id` | Immutable, versioned policy identity. A changed baseline uses a new ID rather than editing this policy. |
| `policy_sha256` | SHA-256 of the referenced policy file's raw bytes. It detects substitution, including a reserialized policy with changed bytes. |
| `story_points` | The approved Story Points group selected during REFINE; it matches `classification.story_points`. |
| `target_elapsed_seconds` | The policy entry's resolved P75 elapsed seconds. It remains the unchanged pace-score target. |
| `baseline_sample_size` | Number of qualifying closed Tasks used for that policy entry. |

Classification and any scorecard binding are immutable across revisions. REFINE approves Story Points; root writes them in the transition to EXECUTE, then validates the complete `.sdlc` graph. If classification must change after approval, preserve the current Task and create a derived follow-up Task instead. See [deterministic performance measurement](performance-measurement.md) for policy derivation, resolution, and score calculation.

## Scorecard policy

A `scorecard_policy` is an immutable, versioned baseline document. It contains only groups that meet its declared minimum sample size:

```yaml
schema_version: '1'
document_type: scorecard_policy
policy_id: delivery-baseline-2026-q3
revision: 0
minimum_sample_size: 4
entries:
  - story_points: 3
    target_elapsed_seconds: 3600
    sample_size: 8
audit:
  - sequence: 1
    event: Derived
    actor: scorecard-policy-deriver
    occurred_at: 2026-07-13T09:00:00Z
```

An entry has exactly `story_points`, `target_elapsed_seconds`, and `sample_size`. Story Points is one of `1`, `2`, `3`, `5`, or `8`; `sample_size` must be at least `minimum_sample_size`; duplicate Story Points entries are invalid. The policy file's contents are never edited after publication. Create a new versioned `policy_id` for any new cohort-derived baseline, then retain the old policy so existing Task bindings continue to validate.

### Stage

Each Stage has an identity, ordered sequence, kind, and ordered Phases. The Stage kind selects its skill and legal Phase kinds:

| Stage kind | Stage skill | Phase kinds |
| --- | --- | --- |
| `DEFINE` | `sdlc-define` | `DEFINE` |
| `REFINE` | `sdlc-refine` | `REFINE` |
| `EXECUTE` | `sdlc-execute` | `PLAN`, `EXECUTE`, `REVIEW`, `SHIP` |
| `IMPROVE` | `sdlc-improve` | `IMPROVE` |

The completed `DEFINE` Phase lifecycle result is the Definition. The completed `REFINE` Phase lifecycle result is the approved Specification. The completed `IMPROVE` Phase lifecycle result is the retrospective with its required Agentic Diagnosis. Consumers locate these values through the hierarchy instead of copying them to Task fields.

EXECUTE Phases are an ordered path, not a one-time checklist. Start with `PLAN`, then `EXECUTE`, then `REVIEW`. A REVIEW may append `PLAN` or `EXECUTE` to correct work, followed by another REVIEW; it may append `SHIP` only when the reviewed candidate is ready. This preserves the actual correction history without rewriting earlier Phases.

### Phase and Lifecycle

A Phase is one occurrence of stage-owned work. It has an identity, a kind, a sequence within its Stage, and an append-only Lifecycle list. Each Lifecycle is one shared root-owned step:

```yaml
lifecycle_id: 01LIFECYCLE
kind: COMPLETE # DEFINE, EXECUTE, VERIFY, IMPROVE, COMPLETE
sequence: 5
state: SUCCEEDED # ACTIVE, SUCCEEDED, FAILED, CANCELLED
result: {}
improvement:
  strengths: []
  frictions: []
  proposals: []
  evidence_refs: []
artifacts: []
```

Lifecycle steps append in exactly this order: `DEFINE` → `EXECUTE` → `VERIFY` → `IMPROVE` → `COMPLETE`. Every Lifecycle has a required RFC3339 `started_at` timestamp with an explicit timezone. An `ACTIVE` Lifecycle has `completed_at: null`; a `SUCCEEDED`, `FAILED`, or `CANCELLED` Lifecycle has a required RFC3339 `completed_at` strictly after `started_at`. Within a Phase, each later Lifecycle starts no earlier than the previous Lifecycle completed, so Lifecycle intervals are ordered and do not overlap. A successful step may append the next one; failed and cancelled entries end that Phase and are immutable. Every successful terminal Lifecycle, including `COMPLETE`, requires a mapping `result` and valid `improvement` evidence. The `COMPLETE` result is the Phase result. It holds the Definition, approved Specification, candidate decision, retrospective, or other phase-specific result as applicable. Artifacts and improvement evidence remain with the Lifecycle that produced them. See [deterministic performance measurement](performance-measurement.md) for the derived snapshot metrics.

### Agentic Diagnosis

The completed `COMPLETE` Lifecycle result for the IMPROVE Stage's IMPROVE Phase must contain exactly this additional shape:

```yaml
agentic_diagnosis:
  facts:
    - statement: Directly recorded observation.
      evidence_refs: [] # Artifact References when the fact relies on external evidence
  hypotheses: [] # Zero or more entries below
  recommendation:
    action: One measurable improvement or monitoring action.
    expected_signal: The observable change expected from the action.
    success_criterion: Explicit threshold or event that determines success.
```

Each hypothesis has exactly `statement`, `confidence`, `evidence_refs`, and `disconfirming_check`; confidence is `LOW`, `MEDIUM`, or `HIGH`. Every fact has exactly `statement` and `evidence_refs`. `facts` must not be empty; `hypotheses` may be empty. Attach an Artifact Reference whenever an external artifact supports a fact or hypothesis. The diagnosis distinguishes recorded evidence from inference, retains no private reasoning transcript, and never turns an unsupported hypothesis into a fact.

Produce this diagnosis from the current validated Task snapshot, its Lifecycle history/results and Artifact References, and the deterministic measurement report for the same revision. It is a pre-close analysis, so it uses raw metrics and the Task's `PROVISIONAL` scorecard result; calibration work has no bound scorecard. Final scorecard values are derived only after `CLOSED`; do not rewrite diagnosis evidence to conform to them. The one recommendation is required to have an action, expected signal, and success criterion. A workflow or policy change must be a derived Task with a `DERIVATION` Task Link, never an unrecorded mutation.

## Task Link

Task Link is an independent aggregate. Its source endpoint, target endpoint, and relationship kind are immutable; its description may change with history. Explicit deletion removes the document and emits audit evidence. Both endpoints must resolve to Tasks in the same `.sdlc/` graph, self-links are invalid, and the graph may contain only one link for a given source, target, and relationship kind.

Kinds: `DERIVATION`, `BLOCKING`, `DEPENDENCY`, `DUPLICATION`, `RELATION`, `IMPLEMENTATION`.

Directional labels are projections of one kind; for example, `IMPLEMENTATION` renders `IMPLEMENTS` / `IMPLEMENTED_BY`.

## Shared Envelopes

A Stage Request and Stage Result identify `task_id`, `stage_id`, active `phase_id` and `lifecycle_id`, the current constraints, selected sensors, prior-result digests, and required approval evidence. A result proposes evidence and the next Phase or Stage; it cannot authorize a transition. Root `sdlc` authorizes transitions.

Artifact References contain `artifact_id`, `type`, `revision`, `uri`, and `sha256`. Validate existence, revision, and digest before relying on an Artifact Reference. Large documents, patches, logs, and reports remain Artifact References; lifecycle results retain only the compact semantic value and evidence references.

## Persistence Profiles

- `LIGHTWEIGHT`: the root agent coordinates through native agent/tool messaging and writes Task snapshots. It does not emulate an event bus or outbox.
- `HARNESS`: a host may coordinate snapshots through ordered, idempotent events and an outbox.

Both profiles preserve the same Task → Stage → Phase → Lifecycle hierarchy. A direct CLI may keep the envelope in session and report that persistent resume is unavailable rather than pretending to write a record.

Validate a new snapshot with the bundled script:

```bash
python3 <skill-dir>/scripts/validate-sdlc-document.py <candidate-or-.sdlc-directory>
```

For a mutation, leave the canonical snapshot untouched while creating temporary `<previous>` and `<candidate>` files. Increment `revision`, append the audit entry, then run:

```bash
python3 <skill-dir>/scripts/validate-sdlc-document.py <candidate> --previous <previous>
```

After that succeeds, replace the canonical snapshot with the candidate and validate the `.sdlc/` directory. Delete temporary files only after both checks pass. Never advance workflow state solely in conversation or memory; the persisted canonical snapshot is the resume point.

To measure a valid Task snapshot without changing it, run:

```bash
python3 <skill-dir>/scripts/measure-sdlc-performance.py <task.yaml>
```

To report an equally weighted cohort of closed Tasks below a directory, run:

```bash
python3 <skill-dir>/scripts/measure-sdlc-performance.py --cohort <directory>
```
