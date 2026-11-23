---
name: ddd
description: Use when modeling a business domain, meaning its language, bounded contexts, aggregates, entities, value objects, repositories or domain events.
allowed-tools: Read Edit
---

# Domain-Driven Design (DDD)

Reusing the vocabulary of an existing `docs/context.md` needs no skill; use this one when the model itself changes.

## Rules for every change in an existing model

This skill owns the domain model's code rules; the `hexagonal-architecture` skill owns ports, layers and imports.

- **Value objects.** Raw primitives appear only at the outer boundary and in application command DTOs. A value object has one validating creation entry, is immutable, equal by all attributes, and its methods return new instances. Every entity attribute, domain method parameter and event payload is a value object; outer layers use them as they are.
- **Failure form.** Expected domain failures use the project's established form, else the profile's default (exception in Java, sealed outcome in Kotlin and Dart, union in TypeScript). Never throw for an expected outcome in an outcome-based project.
- **One creation entry.** Each aggregate has one creation entry on or beside its root (factory constructor, `create`, or a pure `createX`). It takes value objects, assigns identity, records the creation event and returns a valid aggregate or the failure form. Use a separate factory only when creation needs collaborators the root must not hold.
- **Identity.** Generate the identifier value object (`OrderId`) before persistence; it is immutable, and equality uses it alone.
- **Mutation.** Aggregate roots are mutable with private state, changed only by their own named behaviours that take value objects (`cancel(CancellationReason)`, never `setStatus(String)`), in Java, Kotlin and Dart. TypeScript stays functional: behaviours return the new state and events. A behaviour checks multi-field invariants before the transition; it takes no port.
- **Collections.** Never expose a mutable collection; return a read-only view and offer add and remove behaviours.
- **Rebuild from storage.** Each aggregate has one rebuild entry for its persistence adapter (for example `restore`). It runs no creation rules, raises no events, uses the narrowest visibility the language allows and is the only non-creation constructor path.
- **References.** Reference another aggregate by its identifier value object only.
- **One aggregate per use case.** A use case mutates one aggregate; others change through a domain event. Keep an aggregate to its root plus the state its immediate invariants need, and make a child with an unbounded collection its own root referencing the parent by identifier.
- **Services.** A domain service is stateless, only for an operation no single object owns, and never mutates more than one aggregate. Application services hold no business rules.
- **Events.** Name events in the past tense, with value object payloads. The aggregate records them during the command; the use case dispatches after save and clears them after delivery, never on failure. Publish externally through an outbox written in the same transaction. Event-sourced aggregates validate and emit in commands and change state only in private `apply` handlers; handle schema changes with upcasters.

## Steps

1. For a new business workflow or bounded context, run EventStorming before choosing aggregates or components; record it in `docs/event-storming.md`. **Exit gate:** every in-scope event has an owner in the coverage table.
2. Challenge ambiguous terms against domain experts and the code; record each resolved term in `docs/context.md` in business language only. **Exit gate:** each term the change uses has one glossary entry.
3. Partition into bounded contexts using event ownership, invariants and policy handoffs as evidence. Record each integration in `docs/context-map.md` with a named relationship, and classify any sharing as Shared Kernel, Published Language/ACL, layer-specific technical reuse or local duplication. **Exit gate:** each integration has a named relationship.
4. Derive responsibilities from the event flow: aggregates own invariant-bearing decisions, application services handle commands, policies react to events, and each aggregate has one creation entry. Type every entity attribute, domain method parameter and event payload as a Value Object. **Exit gate:** no raw `String`, `double`, `int` or UUID on a public domain signature.

## Context Pointers

- Read [ubiquitous-language.md](references/ubiquitous-language.md) when writing `docs/context.md` entries.
- Read [event-storming.md](references/event-storming.md) when discovering events or deriving responsibilities from a workflow.
- Read [strategic-design.md](references/strategic-design.md) when drawing context boundaries or choosing an integration or sharing pattern.
