---
name: sdlc-execute
description: Plan, implement, review, and present approved work for acceptance.
---

# EXECUTE

Lifecycle position: `EXECUTE` stage skill.

Require an `sdlc`-validated stage envelope; otherwise return `{status: REFUSED, code: INVALID_ENVELOPE, required_stage: sdlc}`. Manage the stage's `PLAN -> EXECUTE -> REVIEW -> SHIP` phases through the shared phase lifecycle defined by root `sdlc`.

- PLAN: return bounded implementation slices, selected guides and sensors, target boundaries, verification, and recovery controls.
- EXECUTE: apply the approved plan, run deterministic sensors, and return evidence, skipped checks, and residual risk. When production behavior and tests are in scope, use red-green-refactor and retain failing and passing test evidence; use `tdd` when appropriate.
- REVIEW: check acceptance coverage, sensor evidence, skipped checks, correction history, and unresolved constraints. Route planning defects to PLAN and implementation defects to EXECUTE.
- SHIP: require a successful review and candidate digest, then present the candidate and verification evidence for human acceptance.

Do not authorize a stage transition.
