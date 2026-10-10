---
name: hexagonal-architecture
description: Use when placing code across API, application, domain and infrastructure layers, or defining ports and adapters.
allowed-tools: Read
---

# Hexagonal Architecture (Ports & Adapters)

## Steps

1. Lay out feature-first directories, one per layer. The domain imports only the language and itself: no web, database, serialization or framework code, and outer layers never reshape domain objects.
2. Name domain ports without a `Port`/`Repository` suffix (`Users`); prefix adapters with their technology (`FirestoreUsers`, `JpaUsers`, `PrismaUsers`).
3. Declare an outbound port in the layer that owns the policy: domain-driven ports in the domain, integration ports in the application layer.
4. Route every inbound adapter through an application use case, trivial reads included. Use cases coordinate transactions, authorization and domain calls, hold no business rules, and import no concrete adapter; they may use the host framework's transaction or DI metadata.
5. Keep technical reuse layer-scoped. A Shared Kernel holds only domain concepts jointly governed by the contexts sharing them, never workflows, ports, DTOs, adapters, persistence or framework types.

**Exit gate:** the project's import or boundary check exits 0 (or, without one, `domain/` imports only the language and the domain).

## Context Pointers

- Read `references/languages/<language>.md` (`dart` for Dart or Flutter, `kotlin`, `java`, `typescript`) when writing code in that language.
- Read [domain-layer.md](references/domain-layer.md) when defining entities, value objects or domain ports.
- Read [application-layer.md](references/application-layer.md) when writing use cases, queries or application ports.
- Read [api-layer.md](references/api-layer.md) when writing inbound adapters (controllers, consumers, UI state holders).
- Read [infrastructure-layer.md](references/infrastructure-layer.md) when writing outbound adapters.
