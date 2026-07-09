---
name: ddd
description: Use when defining domain models, ubiquitous language, bounded contexts, context maps, aggregates, entities, value objects, repositories, domain events, or strategic design decisions.
---

# Domain-Driven Design (DDD)

Follow these steps to establish strategic alignment, define ubiquitous language, partition domain models, and implement tactical DDD patterns.

## Steps

1. **Establish Ubiquitous Language:**
   - Define business terms collaboratively with domain experts. Avoid technical jargon (e.g., use `SubmitOrder`, not `InsertOrderRow`).
   - Maintain a single, versioned glossary in `CONTEXT.md` following the [ubiquitous-language.md](references/ubiquitous-language.md) template.
   - Enforce ubiquitous language across all conversations, specs, tests, and code (class names, database schemas, APIs).
2. **Define Bounded Contexts:**
   - Partition large domains into distinct Bounded Contexts. Each context must have an independent model and its own Ubiquitous Language.
   - Map context relationships (`CONTEXT-MAP.md`) and choose explicit integration patterns to prevent model leakage (e.g., Shared Kernel, Anti-Corruption Layer, Customer-Supplier).
3. **Apply Tactical Modeling:**
   - Model the domain's business invariants using Aggregates (where the Aggregate Root is a specialized Entity; see [entities.md](references/entities.md)).
   - Represent quantities, measurements, or descriptions that have no identity using immutable Value Objects.
   - Separate transient lifecycle rules (Factories) and cross-entity logic (Services) from Entity and Value Object behavior.
   - Capture side-effects and historical states using Domain Events.

## Context Pointers

- Read [ubiquitous-language.md](references/ubiquitous-language.md) when updating or establishing glossary terms.
- Read [strategic-design.md](references/strategic-design.md) when defining bounded contexts, mapping integrations (ACL, OHS/PL, Shared Kernel), or translating external schemas.
- Read [entities.md](references/entities.md) when modeling regular or local entities (including Aggregate Roots).
- Read [value-objects.md](references/value-objects.md) when modeling concepts defined solely by their attributes (without identity).
- Read [aggregates-and-repositories.md](references/aggregates-and-repositories.md) when defining aggregate roots and their repositories.
- Read [services.md](references/services.md) when implementing domain, application, or infrastructure services.
- Read [factories.md](references/factories.md) when encapsulating complex instantiation logic.
- Read [events-and-event-sourcing.md](references/events-and-event-sourcing.md) when dispatching domain events or designing event-sourced systems.
