---
name: sdlc-review
description: Execute the REVIEW Phase of an Autonomous SDLC Delivery Task with unbiased four-eyes code auditing.
---

# REVIEW Phase Executor

Read [the packaged Autonomous SDLC Specification](../sdlc/references/autonomous-sdlc-specification.md). Execute only the active REVIEW Phase according to that specification and return either its proposed typed `PhaseOutcome`, including its Next Action, or a `BlockerReport`. Do not enact that action, select its Actor, decide approval, record events, or alter the Delivery Task.

Read [review-phase.md](../sdlc-execute/references/review-phase.md) for detailed execution steps, adversarial code auditing standards, subagent review delegation, and fallback guidelines when producing the `ReviewDecision`.
