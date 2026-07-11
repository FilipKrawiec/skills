# Workflow Loop Repair Plan

## Objective

Replace the unreleased linear record with aggregate schema v1. Task owns Definition, Specification, Execution Slot, Retrospective, stage, and outcome. Task owns zero or one dependent Task Execution by identity. Task Link is an independent aggregate.

## Authorized Maintenance Mode

Implement this repair directly without recursively invoking SDLC, TDD, personas, reviewers, or subagents. Use `writing-great-skill`, deterministic checks, and one final diff review. Do not create an SDLC record for this repair.

## Required Behavior

- Task stages are `DEFINE`, `SPEC`, `IN_DEVELOPMENT`, `IMPROVE`, `CLOSED`.
- Definition, Specification, and Retrospective are one-shot values mutable only in their matching stage.
- Task Execution is one-to-one, dependent, separately identified, separately persisted, and never recreated.
- PLAN, EXECUTE, REVIEW, and SHIP are append-only Phase Runs inside Task Execution.
- Each Phase Run follows `DEFINE -> EXECUTE -> VERIFY -> IMPROVE -> COMPLETE` and records strengths, frictions, proposals, and evidence.
- REVIEW 1 is broad. REVIEW 2/3 verify prior findings and delta-introduced defects. HIGH/CRITICAL findings block after REVIEW 3; REVIEW 4 is forbidden.
- One SHIP run spans candidate preparation, acceptance, and finalization. Approval binds to the candidate digest.
- Recovery Windows allow `1..3` autonomous tries. Review exhaustion rejects. SHIP/deadline/resource exhaustion waits for human. Human Intervention creates a fresh bounded window without erasing history.
- Retrospective is mandatory for every outcome and may derive independent Tasks linked through Task Link. Derived Tasks wait for HIL SPEC.

## Profiles and Persistence

- `LIGHTWEIGHT` uses native agent/tool messaging. Only the root agent writes aggregate snapshots; no Level 0 event bus or outbox is emulated.
- `HARNESS` uses explicit Level 0, at-least-once events, transactional outbox, per-aggregate ordering, and idempotent consumers.
- Store Task, Task Execution, and Task Link under `.sdlc/` as separate schema-v1 YAML snapshots with revision and audit summaries.
- Store large outputs as verified Artifact References with ID, type, revision, URI, and SHA-256.
- Use the same Phase/Work request-result contract in both profiles; Work exchanges remain transient.

## Verification

- Validate individual snapshots, previous/current transitions, and complete `.sdlc` graphs.
- Test stage gating, immutable values, one-to-one execution, review limits, recovery bounds, budget rules, terminal immutability, link integrity, revision/audit ordering, and artifact references.
- Run validator tests, plugin validation, `git diff --check`, stale-language searches, and one final diff review.
