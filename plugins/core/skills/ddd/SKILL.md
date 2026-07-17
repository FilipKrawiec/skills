---
name: ddd
description: Use when defining a business domain's language, contexts and maps, aggregates, entities, value objects, repositories, domain events, or strategic design.
---

# Domain-Driven Design (DDD)

Establish language, boundaries, and invariants before implementation.

## Steps

1. Define business terms with domain experts; record the single versioned language in `CONTEXT.md` using [ubiquitous-language.md](references/ubiquitous-language.md). Use it consistently in specs, tests, and code.
2. Partition the domain into bounded contexts with independent models; record integrations in `CONTEXT-MAP.md` and choose explicit relationships.
3. Put business invariants in Aggregates, identity-free concepts in immutable Value Objects, construction policy in Factories, cross-entity policy in Services, and observable facts in Domain Events.

## Context Pointers

- Read [ubiquitous-language.md](references/ubiquitous-language.md) when updating or establishing glossary terms.
- Read [strategic-design.md](references/strategic-design.md) when defining bounded contexts, mapping integrations (ACL, OHS/PL, Shared Kernel), or translating external schemas.
- Read [entities.md](references/entities.md) when modeling regular or local entities (including Aggregate Roots).
- Read [value-objects.md](references/value-objects.md) when modeling concepts defined solely by their attributes (without identity).
- Read [aggregates-and-repositories.md](references/aggregates-and-repositories.md) when defining aggregate roots and their repositories.
- Read [services.md](references/services.md) when implementing domain, application, or infrastructure services.
- Read [factories.md](references/factories.md) when encapsulating complex instantiation logic.
- Read [events-and-event-sourcing.md](references/events-and-event-sourcing.md) when dispatching domain events or designing event-sourced systems.
