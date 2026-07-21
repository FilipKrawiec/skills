---
name: ddd
description: Use when defining a business domain's language, contexts and maps, aggregates, entities, value objects, repositories, domain events, or strategic design.
---

# Domain-Driven Design (DDD)

Use DDD for active domain modeling: establish and sharpen language, boundaries, and invariants before implementation. Reading an existing `CONTEXT.md` only to reuse its vocabulary is passive consumption; invoke this skill when the model itself needs to change.

## Mandatory Steps

1. **Read Strategic References First**: You MUST read [strategic-design.md](references/strategic-design.md) and [ubiquitous-language.md](references/ubiquitous-language.md) BEFORE defining Bounded Contexts, package layouts, or updating `CONTEXT.md`.
2. **Domain & Language First**: Always define Bounded Context boundaries, the Ubiquitous Language, and the core domain model *before* planning integration details, frameworks, or database schemas. Never invent artificial business contexts for infrastructure/connectivity logic.
3. **Glossary Cleanliness (`CONTEXT.md`)**: Challenge ambiguous business terms with domain experts and cross-check them against the code. Record each resolved term in `CONTEXT.md`. Never put code file paths, database tables, or framework classes in `CONTEXT.md`.
4. **Context Mapping (`CONTEXT-MAP.md`)**: Partition the domain into bounded contexts with independent models; record integrations in `CONTEXT-MAP.md`, choose explicit relationships, and classify proposed sharing as Shared Kernel, Published Language/ACL, layer-specific technical reuse, or local duplication.
5. **Tactical Domain Modeling**: Put business invariants in Aggregates, identity-free concepts in immutable Value Objects, construction policy in Factories, cross-entity policy in Services, and observable facts in Domain Events.

## Context Pointers

- Read [ubiquitous-language.md](references/ubiquitous-language.md) when updating or establishing glossary terms.
- Read [strategic-design.md](references/strategic-design.md) when defining bounded contexts, mapping integrations (ACL, OHS/PL, Shared Kernel), or translating external schemas.
- Read [entities.md](references/entities.md) when modeling regular or local entities (including Aggregate Roots).
- Read [value-objects.md](references/value-objects.md) when modeling concepts defined solely by their attributes (without identity).
- Read [aggregates-and-repositories.md](references/aggregates-and-repositories.md) when defining aggregate roots and their repositories.
- Read [services.md](references/services.md) when implementing domain, application, or infrastructure services.
- Read [factories.md](references/factories.md) when encapsulating complex instantiation logic.
- Read [events-and-event-sourcing.md](references/events-and-event-sourcing.md) when dispatching domain events or designing event-sourced systems.
