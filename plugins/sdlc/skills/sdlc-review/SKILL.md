---
name: sdlc-review
description: SDLC review phase.
---

# REVIEW

Require an `sdlc`-validated phase envelope; otherwise return `{status: REFUSED, code: INVALID_ENVELOPE, required_phase: sdlc}`. Check acceptance coverage, deterministic sensor evidence, skipped checks and risk, correction history, and unresolved constraints. Inferential review is secondary to deterministic evidence. Return findings and request SHIP, PLAN, or EXECUTE. Only a successful review may request SHIP; do not authorize the transition.
