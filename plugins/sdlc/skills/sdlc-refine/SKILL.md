---
name: sdlc-refine
description: Turn a definition into an approved, story-pointed delivery contract.
---

# REFINE

Lifecycle position: `REFINE` stage skill.

Require an `sdlc`-validated stage envelope; otherwise return `{status: REFUSED, code: INVALID_ENVELOPE, required_stage: sdlc}`. Manage this stage through the shared phase lifecycle defined by root `sdlc`. Turn the definition into an executable specification: deliverable, completion condition, acceptance criteria, constraints, risks, allowed paths, and verification. Before approval, select exactly one Story Points value—`1`, `2`, `3`, `5`, or `8`—with the human. Require human approval before requesting the `EXECUTE` stage. In that approved transition, root `sdlc` binds `{story_points}`; if an immutable policy has an entry, root resolves and copies the scorecard envelope, otherwise it leaves `scorecard: null` for calibration. A Task agent never supplies a duration estimate. Read [scorecard-policy.md](references/scorecard-policy.md) before selecting Story Points. Do not authorize execution.
