---
name: ddd
description: Use when modeling a business domain, meaning its language, bounded contexts, aggregates, entities, value objects, repositories or domain events.
allowed-tools: Read Edit
---

# Domain-Driven Design (DDD)

Establish and sharpen language, boundaries and invariants before implementation. Reusing the vocabulary of an existing `docs/context.md` needs no skill; invoke this one when the model itself changes.

## Steps

1. Read the one reference below that matches the modeling task. **Exit gate:** that reference is loaded.
2. When introducing a new business workflow or bounded context, run an EventStorming session before choosing aggregates or components. Capture the in-scope facts that can happen, order them into workflows and variants, and trace their commands, actors, policies, and external interactions. Record the result in `docs/event-storming.md`. **Exit gate:** every in-scope event has an owner in the coverage table.
3. Challenge ambiguous business terms with domain experts and cross-check them against the code. Record each resolved term in `docs/context.md`, in business language only (code paths, tables and framework classes belong in code). **Exit gate:** each term used in the change has one glossary entry.
4. Partition the domain into bounded contexts with independent models; use event ownership, invariants, and policy handoffs as evidence. Record integrations in `docs/context-map.md`, choose explicit relationships, and classify proposed sharing as Shared Kernel, Published Language/ACL, layer-specific technical reuse, or local duplication; infrastructure and connectivity logic stays inside the context it serves. **Exit gate:** each integration has a named relationship.
5. Derive responsibilities from the event flow: aggregates protect invariant-bearing decisions, application services handle commands, policies react to events, and each aggregate has one creation entry (a separate factory only when creation needs collaborators). Type every entity attribute, method parameter and domain event payload as a Value Object in the encoding the language profile prescribes (class, record, branded or extension type); where this skill and a language profile differ on encoding, the profile wins and this skill carries only the rule. **Exit gate:** the domain compiles with no raw `String`, `Double`, `Int` or `UUID` on a public domain signature.

## Context Pointers

- Read [ubiquitous-language.md](references/ubiquitous-language.md) when updating or establishing glossary terms in `docs/context.md`.
- Read [event-storming.md](references/event-storming.md) when refining a business workflow, discovering domain events, or deriving context and component responsibilities from behavior.
- Read [strategic-design.md](references/strategic-design.md) when defining bounded contexts, mapping integrations (ACL, OHS/PL, Shared Kernel), or translating external schemas.
- Read [entities.md](references/entities.md) when modeling regular or local entities (enforcing strict Value-Object field and parameter typing).
- Read [value-objects.md](references/value-objects.md) when modeling concepts without identity (one validating creation entry per Value Object, zero primitive leakage in domain models).
- Read [aggregates-and-repositories.md](references/aggregates-and-repositories.md) when defining aggregate roots, repository ports, and anti-corruption layer persistence boundaries.
- Read [services.md](references/services.md) when implementing domain, application, or infrastructure services.
- Read [factories.md](references/factories.md) when creating aggregates (one creation entry per aggregate, when a separate factory is justified, creation versus reconstitution).
- Read [events-and-event-sourcing.md](references/events-and-event-sourcing.md) when dispatching domain events or designing event-sourced systems.
