---
name: sdlc-execute
description: SDLC execution phase.
---

# EXECUTE

Require an `sdlc`-validated phase envelope; otherwise return `{status: REFUSED, code: INVALID_ENVELOPE, required_phase: sdlc}`. Apply the current plan within its constraints and run its selected deterministic sensors; return evidence, failed or skipped checks, and residual risk. Correct a finding within the bounded recovery count and rerun the relevant sensor. When production behavior and tests are in scope, use red-green-refactor and retain failing and passing test evidence; use `tdd` when it is available and appropriate. Request REVIEW; do not authorize it.
