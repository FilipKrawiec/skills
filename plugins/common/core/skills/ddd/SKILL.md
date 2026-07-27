---
name: ddd
description: Use when defining a business domain's language, contexts and maps, aggregates, entities, value objects, repositories, domain events, or strategic design.
---

# Domain-Driven Design (DDD)

Use DDD for active domain modeling: establish and sharpen language, boundaries, and invariants before implementation. Reading an existing `docs/context.md` only to reuse its vocabulary is passive consumption; invoke this skill when the model itself needs to change.

## Steps

1. Check context pointers to read the specific reference file (e.g. [ubiquitous-language.md](references/ubiquitous-language.md) for glossary work, [strategic-design.md](references/strategic-design.md) for context mapping) relevant to your modeling task.
2. For new or changed business behavior, run an EventStorming session before choosing bounded contexts, aggregates, or components. Capture the in-scope facts that can happen, order them into workflows and variants, and trace their commands, actors, policies, and external interactions. Record the result in `docs/event-storming.md` or the team's equivalent durable artifact.
3. Challenge ambiguous business terms with domain experts and cross-check them against the code. Record each resolved term in `docs/context.md` or `docs/glossary.md`. Never put code file paths, database tables, or framework classes in `docs/context.md`.
4. Partition the domain into bounded contexts with independent models; use event ownership, invariants, and policy handoffs as evidence. Record integrations in `docs/context-map.md`, choose explicit relationships, and classify proposed sharing as Shared Kernel, Published Language/ACL, layer-specific technical reuse, or local duplication. Never invent artificial business contexts for infrastructure/connectivity logic.
5. Derive responsibilities from the event flow: aggregates protect invariant-bearing decisions, application services handle commands, and policies react to events. Add a component only when it has a distinct responsibility; an EventStorming sticky note is not itself a component.

## Context Pointers

- Read [ubiquitous-language.md](references/ubiquitous-language.md) when updating or establishing glossary terms in `docs/context.md` or `docs/glossary.md`.
- Read [event-storming.md](references/event-storming.md) when refining a business workflow, discovering domain events, or deriving context and component responsibilities from behavior.
- Read [strategic-design.md](references/strategic-design.md) when defining bounded contexts, mapping integrations (ACL, OHS/PL, Shared Kernel), or translating external schemas.
- Read [entities.md](references/entities.md) when modeling regular or local entities (including Aggregate Roots).
- Read [value-objects.md](references/value-objects.md) when modeling concepts defined solely by their attributes (without identity).
- Read [aggregates-and-repositories.md](references/aggregates-and-repositories.md) when defining aggregate roots and their repositories.
- Read [services.md](references/services.md) when implementing domain, application, or infrastructure services.
- Read [factories.md](references/factories.md) when encapsulating complex instantiation logic.
- Read [events-and-event-sourcing.md](references/events-and-event-sourcing.md) when dispatching domain events or designing event-sourced systems.
