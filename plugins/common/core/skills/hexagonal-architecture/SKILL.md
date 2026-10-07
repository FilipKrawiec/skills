---
name: hexagonal-architecture
description: Use when designing or placing code across API, application, domain and infrastructure layers, or defining ports and adapters.
allowed-tools: Read
---

# Hexagonal Architecture (Ports & Adapters)

## Steps

1. Read the language profile and the layer reference below that match the task. **Exit gate:** both are loaded.
2. Lay out feature-first directories with the layers the profile prescribes. The domain imports only the language and itself: no web, database, serialization or framework code, and outer layers never reshape domain objects.
3. Name domain ports without a `Port`/`Repository` suffix (`Users`); prefix adapters with their technology (`FirestoreUsers`, `JpaUsers`, `PrismaUsers`).
4. Declare an outbound port in the layer that owns the policy: domain-driven ports in the domain, integration ports in the application layer.
5. Route every inbound adapter through an application use case, trivial reads included. Use cases coordinate transactions, authorization and domain calls, hold no business rules, and import no concrete adapter; they may use the host framework's transaction or DI metadata. Match the framework the codebase already uses.
6. Keep technical reuse layer-scoped; a Shared Kernel is domain-only (`ddd`, strategic-design).

**Exit gate:** the project's import or boundary check exits 0 (or, without one, `domain/` imports only the language and the domain).

## Context Pointers

- Read [domain-layer.md](references/domain-layer.md) when defining entities, value objects or domain ports.
- Read [application-layer.md](references/application-layer.md) when writing use cases, queries or application ports.
- Read [api-layer.md](references/api-layer.md) when writing inbound adapters (controllers, consumers, UI state holders).
- Read [infrastructure-layer.md](references/infrastructure-layer.md) when writing outbound adapters.
- Read the codebase's language profile: [dart.md](references/languages/dart.md) (Dart or Flutter), [kotlin.md](references/languages/kotlin.md), [java.md](references/languages/java.md), [typescript.md](references/languages/typescript.md).
