# ADR-0008: Model SDLC as a Portable Skill Contract

## Decision

Extract SDLC from the general workflow plugin into a standalone plugin. It provides an `sdlc` orchestrator plus independently invocable `sdlc-define`, `sdlc-spec`, `sdlc-plan`, `sdlc-execute`, `sdlc-review`, `sdlc-ship`, and `sdlc-improve` phase skills.

The `sdlc` orchestrator defines constraint and budget enforcement, phase authorization, recovery, the PLAN-to-EXECUTE-to-REVIEW loop, review-gated SHIP, and transition to IMPROVE. It alone authorizes a lifecycle transition. Every phase uses a portable envelope containing required context and evidence and returning a proposed result or structured refusal. `sdlc-execute` uses red-green-refactor and test evidence when production behavior and tests are in scope; delegation, sandboxing, commits, and harness verification are optional adapters.

Required invariants and optional capabilities are defined in one transition-and-capability reference. A CLI may use the contract directly and must report unavailable capabilities, such as cross-session resume, rather than assume eligibility. Any harness may coordinate or persist the same contracts. No harness implementation is part of the default skill instructions.

## Context

The existing SDLC skill combines a portable workflow model with lightweight YAML persistence and Quarkus Harness detail. That makes routine CLI use costly and presents implementation choices as universal requirements. Keeping SDLC within a general workflow plugin also obscures its role as an integration boundary.

## Consequences

- Agents and harnesses share the same orchestration and phase semantics without sharing a runtime.
- Direct CLI use can remain compact and avoid unnecessary persistence.
- `sdlc` is the only model-discoverable entry point; phase skills are explicitly selected by callers or the orchestrator.
- Phase skills must validate their envelope and return a structured refusal for missing or invalid context.
- Harness implementers own their adapter, persistence, and recovery mechanisms.
