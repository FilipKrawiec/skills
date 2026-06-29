# ADR-0001: Store Skills Under Root `skills/`

## Decision

Store repository skills directly under `skills/<skill>/`.

## Context

The repository is a personal skill collection, not a single app codebase. Skills should be easy for agents to discover as agent-facing material while leaving `docs/` available for durable records such as ADRs and research notes.

Codex plugin validation requires the plugin manifest `skills` field to resolve to a root `skills` directory. Keeping each skill directly under `skills/` avoids wrappers, mirrors, and product-specific path exceptions.

## Consequences

Future skill work should happen under `skills/`.

Root and nested `AGENTS.md` files should carry editing guardrails. `docs/` should not duplicate those instructions; it should record decisions and dated notes.
