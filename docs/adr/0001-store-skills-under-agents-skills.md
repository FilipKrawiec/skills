# ADR-0001: Store Skills Under `.agents/skills`

## Decision

Store repository skills under `.agents/skills/<category>/<skill>/`.

## Context

The repository is a personal skill collection, not a single app codebase. Skills should be easy for agents to discover as agent-facing material while leaving `docs/` available for durable records such as ADRs and research notes.

The layout also keeps category grouping without mixing skill implementation files with project records.

## Consequences

Future skill work should happen under `.agents/skills/`.

Root and nested `AGENTS.md` files should carry editing guardrails. `docs/` should not duplicate those instructions; it should record decisions and dated notes.
