# ADR-0002: Use Domain-Driven Design and Hexagonal Architecture for Clean Separation

## Decision

We will structure systems using Domain-Driven Design (DDD) and Hexagonal Architecture (Ports and Adapters) principles to ensure highly maintainable, decoupled codebases. 

The detailed architecture guidelines are maintained in the canonical [domain-driven-design-and-hexagonal-architecture.md](../../skills/hexagonal-architecture/references/domain-driven-design-and-hexagonal-architecture.md) reference.

## Context

Agents frequently take shortcuts, mix concerns, and think horizontally (e.g., database-first or framework-first development). This leads to leaky abstractions and rigid codebases. 

## Consequences

- Agents are constrained to model the domain first using pure language code.
- Infrastructure details (like SQL schemas or HTTP client libraries) are isolated, enabling adapters to be swapped or refactored with minimal risk to business logic.
- We must provide a concrete skill (`domain-driven-design`) to guide agents in this architecture.
