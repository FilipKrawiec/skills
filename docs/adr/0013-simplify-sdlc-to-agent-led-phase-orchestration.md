# ADR-0013: Simplify SDLC to Agent-led Phase Orchestration

## Decision

Model the portable SDLC contract as `Task -> Stage[] -> Phase[]`. Preserve the DEFINE, REFINE, EXECUTE, and IMPROVE Stages, and preserve EXECUTE's `PLAN -> EXECUTE -> REVIEW -> SHIP` Phase path. Remove the shared nested lifecycle from every Phase.

An agent acts as the orchestrator. It loads the active Task, selects the active Phase, supplies its input to an executor, verifies the returned result, records the Phase boundary, and advances only through legal Stage and Phase paths. The executor may be the orchestrator or any agent the host can delegate to. The contract does not prescribe a vendor, delegation transport, headless command, or service runtime.

A Task record preserves only the current and completed Phase boundaries: Phase input, terminal result, verification evidence, revision, and append-only history. Hosts may enforce these rules through their own service, library, or tool. This skill library supplies the portable contract, not an orchestration runtime.

## Context

The previous model combined Stage and Phase semantics with a universal internal lifecycle, state-authority protocol, scorecard policies, cohort measurement, and structured diagnosis. That made a black-box Phase expose and satisfy a second nested workflow regardless of its actual work. It also made routine autonomous delivery depend on a large runtime contract instead of the observable Stage and Phase boundaries that agents and hosts share.

## Consequences

- A Phase is portable: `input -> terminal result + verification evidence`.
- Agents can orchestrate directly or use their host's native delegation without vendor-specific contract changes.
- Observable progress is recorded at Phase boundaries, not as agent-internal microstates.
- The SDLC package no longer includes state-store, lifecycle, scorecard, measurement, or diagnosis machinery.
- ADRs 0007 through 0012 remain historical records and are superseded where they conflict with this decision.
