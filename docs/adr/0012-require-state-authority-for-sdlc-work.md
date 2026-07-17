# ADR-0012: Require a State Authority for SDLC Work

> Superseded by ADR-0013.

## Decision

Every repository-changing SDLC Task has exactly one durable **State Authority** accessed through a **State Store** port. Root `sdlc` loads and validates the current Task, authorizes a revision-checked transition, and refuses repository mutation when the store is missing, stale, unavailable, or rejects that transition.

Direct CLI work uses the local `.sdlc/` file store. A control plane uses its revisioned Task API or database. A hybrid local mirror is a **State Projection** only; it cannot become a competing authority.

## Consequences

- Direct CLI work now persists lifecycle timestamps, evidence, measurement inputs, and resume state.
- Control planes retain concurrency, approval, idempotency, event, and outbox responsibilities without changing the Task → Stage → Phase → Lifecycle contract.
- SHIP and VCS integration bind a commit authorization to the authoritative Task revision and candidate digest.
- Hosts cannot silently fall back to conversation-only state for repository-changing work.
