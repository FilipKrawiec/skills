---
name: sdlc-define
description: Define a requested outcome, scope, and initial constraints.
---

# DEFINE

Lifecycle position: `DEFINE` stage skill.

Require an `sdlc`-validated stage envelope; otherwise return `{status: REFUSED, code: INVALID_ENVELOPE, required_stage: sdlc}`. Manage this stage through the shared phase lifecycle defined by root `sdlc`. Return a compact definition: outcome, context, initial scope, and references. Request transition to `REFINE`; do not authorize it.
