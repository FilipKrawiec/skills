# Workflow Loop Repair Plan

## Objective

Use aggregate schema v1 to record SDLC work in the same structure agents use to navigate it:

```text
Task → Stage[] → Phase[] → Lifecycle[]
```

Definition and Specification are results of completed DEFINE and REFINE phase lifecycles. They are not top-level Task values or a separate execution record.

## Authorized Maintenance Mode

Implement this repair directly without recursively invoking SDLC, TDD, personas, reviewers, or subagents. Use `writing-great-skill`, deterministic checks, and one final diff review. Do not create an SDLC record for this repair.

## Required Behavior

- Task Stages append as `DEFINE`, `REFINE`, `EXECUTE`, and `IMPROVE`; `CLOSED` is a terminal Task state.
- Each Stage maps to its stage skill and owns its ordered Phases. Root `sdlc` owns the shared lifecycle for every Phase: `DEFINE -> EXECUTE -> VERIFY -> IMPROVE -> COMPLETE`.
- Definition is the completed DEFINE Lifecycle result. Specification is the approved completed REFINE Lifecycle result. Retrospective is the completed IMPROVE Lifecycle result.
- EXECUTE starts with PLAN, EXECUTE, and REVIEW. REVIEW appends PLAN or EXECUTE for correction, followed by a new REVIEW, or appends SHIP when ready. Earlier evidence is never rewritten.
- SHIP records candidate preparation, digest-bound acceptance, and finalization. A candidate change requires correction work and fresh REVIEW before renewed acceptance.
- Every Lifecycle records its outcome, improvement evidence, and Artifact References. Completed history is immutable.
- Follow-up work is an independent Task connected by Task Link; it does not execute automatically.

## Profiles and Persistence

- `LIGHTWEIGHT` uses native agent/tool messaging. The root agent writes one Task snapshot; no Level 0 event bus or outbox is emulated.
- `HARNESS` may use ordered, idempotent events and a transactional outbox while preserving the same nested Task hierarchy.
- Store Task and Task Link under `.sdlc/` as schema-version-1 YAML snapshots with revision and audit summaries.
- Store large outputs as verified Artifact References with ID, type, revision, URI, and SHA-256.
- Stage request-result exchanges are transient. Persist compact results, improvement evidence, audit summaries, and Artifact References in the producing Lifecycle.

## Verification

- Validate individual snapshots, previous/current transitions, and complete `.sdlc` graphs.
- Test stage ordering, stage-to-phase mapping, lifecycle ordering, correction loops, result provenance, terminal immutability, link integrity, revision/audit ordering, and artifact references.
- Run validator tests, plugin validation, `git diff --check`, stale-language searches, and one final diff review.
