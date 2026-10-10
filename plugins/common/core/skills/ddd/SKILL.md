---
name: ddd
description: Use when modeling a business domain, meaning its language, bounded contexts, aggregates, entities, value objects, repositories or domain events.
allowed-tools: Read Edit
---

# Domain-Driven Design (DDD)

Reusing the vocabulary of an existing `docs/context.md` needs no skill; use this one when the model itself changes.

## Steps

1. For a new business workflow or bounded context, run EventStorming before choosing aggregates or components; record it in `docs/event-storming.md`. **Exit gate:** every in-scope event has an owner in the coverage table.
2. Challenge ambiguous terms against domain experts and the code; record each resolved term in `docs/context.md` in business language only. **Exit gate:** each term the change uses has one glossary entry.
3. Partition into bounded contexts using event ownership, invariants and policy handoffs as evidence. Record each integration in `docs/context-map.md` with a named relationship, and classify any sharing as Shared Kernel, Published Language/ACL, layer-specific technical reuse or local duplication. **Exit gate:** each integration has a named relationship.
4. Derive responsibilities from the event flow: aggregates own invariant-bearing decisions, application services handle commands, policies react to events, and each aggregate has one creation entry. Type every entity attribute, domain method parameter and event payload as a Value Object. **Exit gate:** no raw `String`, `double`, `int` or UUID on a public domain signature.

## Context Pointers

- Read [ubiquitous-language.md](references/ubiquitous-language.md) when writing `docs/context.md` entries.
- Read [event-storming.md](references/event-storming.md) when discovering events or deriving responsibilities from a workflow.
- Read [strategic-design.md](references/strategic-design.md) when drawing context boundaries or choosing an integration or sharing pattern.
- Read [entities.md](references/entities.md) when modeling an entity or aggregate root's identity, fields and methods.
- Read [value-objects.md](references/value-objects.md) when modeling a concept without identity.
- Read [aggregates-and-repositories.md](references/aggregates-and-repositories.md) when sizing an aggregate or designing repository and query ports.
- Read [services.md](references/services.md) when deciding where an operation that fits no single object lives.
- Read [factories.md](references/factories.md) when writing an aggregate's creation entry.
- Read [events-and-event-sourcing.md](references/events-and-event-sourcing.md) when dispatching domain events or event-sourcing an aggregate.
