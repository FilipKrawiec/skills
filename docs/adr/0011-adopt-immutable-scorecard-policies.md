# ADR-0011: Adopt Immutable Scorecard Policies

## Decision

Replace task-supplied pace targets with immutable, versioned `scorecard_policy` documents. A policy maintainer derives each policy from a closed comparable cohort, groups Tasks by Story Points (`1`, `2`, `3`, `5`, or `8`), and records the observed elapsed-time P75 only for groups meeting a declared minimum sample size.

During REFINE, a human approves the Task's Story Points. The Task has `classification: null` and `scorecard: null` through DEFINE and REFINE. In the approved transition that appends EXECUTE, root `sdlc` always binds `{story_points}`. If a policy entry exists, root resolves that entry and copies the resolver's `scorecard` envelope into the Task before delivery work. The binding includes the policy ID, SHA-256 of the policy file's raw bytes, Story Points, resolved target, and sample size. If no entry exists, the Task remains a calibration Task with `scorecard: null`; it supplies raw evidence for later derivation. Complete `.sdlc` graph validation verifies each non-null scorecard against the retained policy file.

Published policies are never edited. A changed cohort, baseline, or rule receives a new versioned policy ID. A Task cannot be reclassified after approval; classification errors and unavailable groups become IMPROVE evidence and, when action is needed, a derived follow-up Task.

## Context

A Task-owned, freely chosen duration target makes the pace component easy to inflate. A single score remains useful only when its pace input is comparable and cannot be selected opportunistically by the agent being measured. Historical delivery outcomes provide a reproducible baseline without adding host-specific telemetry.

## Consequences

- Pace compares a policy-bound Task with sufficiently sampled historical work of the same Story Points rather than its own estimate.
- Policy SHA-256 binding detects replacement or reserialization of the referenced policy file.
- Sparse Story Points groups cannot receive artificial targets; they remain calibration work until a qualifying cohort exists.
- The existing pace and health-score formulas remain unchanged, so score trends remain interpretable across this control change only within the same policy regime.
- Policy maintenance and Story Points classification corrections create visible follow-up work instead of silently rewriting Task history.
