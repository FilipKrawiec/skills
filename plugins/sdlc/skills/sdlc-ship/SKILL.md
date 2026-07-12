---
name: sdlc-ship
description: SDLC shipping phase.
---

# SHIP

Require an `sdlc`-validated phase envelope; otherwise return `{status: REFUSED, code: INVALID_ENVELOPE, required_phase: sdlc}`. Require successful review and the manifest-derived current candidate digest. Present the candidate and its verification evidence for human acceptance. Return acceptance or rejection evidence and request IMPROVE; do not authorize it.
