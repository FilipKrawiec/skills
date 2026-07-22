---
name: sdlc
description: Use when an agent must coordinate a repository change according to the Autonomous SDLC Specification.
---

# Autonomous SDLC Orchestrator

Read [the packaged Autonomous SDLC Specification](references/autonomous-sdlc-specification.md) before acting. It is the distributable copy of the canonical specification and the authority for domain language, typed Phase contracts, workflow, and conformance while this plugin is installed.

Act as the orchestrator for one Delivery Task. Dispatch from its current state:

- `ACTIVE`: assemble the active Phase input; delegate it; validate its proposed Phase Outcome or Blocker Report; apply only the legal command and events.
- `AWAITING_APPROVAL`: obtain the decision from the selected eligible non-contributor; validate and apply `DecideApproval`.
- `AWAITING_UNBLOCK`: obtain resolution Evidence from the selected unblocking Actor; validate and apply `ResolveUnblock`.
- `AWAITING_INVESTIGATION`: apply only authorized `SPLIT` or `CANCEL` through `ResolveInvestigation`.
- `CLOSED`: take no action.

Enforce the Delivery Guard at its active-time deadline and before any new non-terminal Phase starts.

Do not invent lifecycle steps, persistence formats, command-line behavior, or vendor-specific executor requirements.
