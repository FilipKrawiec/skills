# ADR-0014: Adopt an Internal Autonomous SDLC Specification

## Decision

Make `spec/autonomous-sdlc/SPECIFICATION.md` the authoritative internal definition of the Autonomous SDLC bounded context. It defines entities, value objects, commands, events, invariants, typed Stage and Phase contracts, workflow, and conformance scenarios.

The installed SDLC plugin ships verified copies in its root skill's local `references/` directory. They are a distributable projection, not a second authority; regression checks require semantic equality with the canonical specification and conformance document, allowing only the local documentation link required by the package layout.

The SDLC plugin becomes an agent-facing consumer of that specification. Hosts, including agent orchestrators and Quarkus applications, implement the same domain behavior but own their own persistence, execution, transport, and delegation mechanisms. No SDLC CLI or reference runtime ships as part of the plugin.

## Context

The interim Stage/Phase simplification removed costly lifecycle machinery, but retained an untyped YAML record and a Python validator. That left the domain semantics distributed between skill prose and a runtime-shaped contract. It could neither serve as a dependable implementation design nor preserve a strict black-box boundary for Phase Executors.

## Consequences

- The domain model and workflow have one normative source.
- Phase Executors are vendor-neutral but must exchange typed domain values.
- Conformance is defined through rules and scenarios rather than a required implementation.
- The plugin no longer owns persistence formats, a CLI, or duplicate workflow definitions.
- ADR-0013 is superseded where it describes the plugin's phase-contract record as the portable contract.
