---
name: hexagonal-architecture
description: Use when designing or placing code across API, application, domain and infrastructure layers, or defining ports and adapters.
allowed-tools: Read
---

# Hexagonal Architecture (Ports & Adapters)

This skill owns layers, imports, ports and adapters; the `ddd` skill owns the domain model's code rules (value objects, creation, mutation, failure form).

## Steps

1. Lay out feature-first directories, one per layer. The domain imports only the language and itself: no web, database, serialization, framework or ORM annotations, no UI-convenience fields. Outer layers use domain value objects as they are and never reshape domain objects.
2. Name ports as a plural collection for repositories (`Users`), with no `Port` or `Repository` suffix; a `Queries` suffix for read ports; a role suffix for functional ports (`NotificationSender`). Prefix adapters with their technology (`FirestoreUsers`, `JpaUsers`, `PrismaUsers`). Repositories exist for aggregate roots only and load and save the whole aggregate; add `exists(id)` or `count` methods instead of loading to count.
3. Declare an outbound port in the layer that owns the policy: domain-driven ports in the domain, integration ports in the application layer. Small aggregate-local types and the aggregate's repository port may share the root's file.
4. Route every inbound adapter through an application use case, trivial reads included. Commands load an aggregate, call its behaviour, save through ports, then dispatch its events. A use case coordinates transactions, authorization and domain calls, holds no business rules, imports no concrete adapter or ORM, DAO or transport type; it may use the host framework's transaction or DI metadata. Return an explicit result for an expected failure (missing aggregate, unchanged); never leak an adapter exception.
5. When an invariant needs external state, the use case reads the fact through its outbound port and passes it to the aggregate behaviour as a value. Aggregates and entities hold no adapter, client, service locator or port.
6. Queries return read models owned by the application layer, never aggregates: through an application-level query port that bypasses the domain, or a `Queries` port declared there.
7. The API layer owns transport: routing, status codes, (de)serialization, rate limits and structural payload validation. It maps each request to a command or query, calls the use case injected directly (no mediator or bus), holds no business logic, owns its request and response DTOs, and maps domain values to its own transport form, never exposing a domain type.
8. Infrastructure holds persistence models, DAOs, mappers and client models; it maps them to domain types inside the adapter and never passes them inward. A DAO is a private helper of an adapter, never a port. A database-backed check (uniqueness) is a domain-named port (`EmailUniqueness`) whose adapter uses the DAO. Keep adapters non-public where the language allows, and wire them at the composition root.
9. Compose UI from the project's own component library: feature code never hand-rolls a primitive (button, input, select, a Material widget) the library should own, and a missing primitive is added to the library first, never inline in the feature. One design system per project, no cross-project kit.
10. Keep technical reuse layer-scoped. A Shared Kernel holds only domain concepts jointly governed by the contexts sharing them, never workflows, ports, DTOs, adapters, persistence or framework types.

**Exit gate:** the project's import or boundary check exits 0 (or, without one, `domain/` imports only the language and the domain).

## Context Pointers

- Read `references/languages/<language>.md` (`dart` for Dart or Flutter, `kotlin`, `java`, `typescript`) when writing code in that language.
