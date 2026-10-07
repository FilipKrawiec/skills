---
name: hexagonal-architecture
description: Use when designing or placing code across API, application, domain and infrastructure layers, or defining ports and adapters.
allowed-tools: Read
---

# Hexagonal Architecture (Ports & Adapters)

## Steps

1. Before designing or writing code, read the language profile and the layer reference below that match the task. **Exit gate:** both are loaded.
2. Keep the Domain layer free of framework and infrastructure dependencies (zero web, database, or serialization imports). All outer layers can use domain objects, but must not influence their form.
3. Use feature-first package/directory boundaries with the layer layout the language profile prescribes.
4. Apply domain port naming parity: omit `Port`/`Repository` suffixes on domain ports (`Users`, `ApplicationMetadatas`); prepend technology names on adapters (`JpaUsers`, `AgroalApplicationMetadatas`, `PrismaUsers`, `FirestoreUsers`).
5. Declare outbound ports at the layer that owns the policy: domain-driven ports in Domain; integration-specific ports in Application.
6. Let Application use cases coordinate transactions, security, and Domain actions without business rules. Application services may use the host framework's transaction/DI metadata while remaining free of concrete infrastructure adapters. The profiles prescribe no framework: match the one the codebase uses.
7. Keep adapters at the edge: inbound adapters map requests to commands/queries and invoke application use cases, trivial queries included; outbound adapters map ports to external systems and keep their data models internal.
8. Keep technical reuse layer-scoped. A DDD Shared Kernel is domain-only and jointly owned by its named Bounded Contexts; cross-layer component libraries live outside it.

**Exit gate:** the project's import or architecture rule check exits 0 (or, without one, `domain/` imports only the language and the domain itself).

## Context Pointers

- Read [domain-layer.md](references/domain-layer.md) when defining core domain entities, value objects, and domain-level outbound ports (like repositories).
- Read [application-layer.md](references/application-layer.md) when creating application use-cases, commands/queries, or application-level outbound ports (like email/SMS integration clients).
- Read [api-layer.md](references/api-layer.md) when writing inbound adapters (like HTTP/gRPC controllers, Kafka event consumers).
- Read [infrastructure-layer.md](references/infrastructure-layer.md) when writing outbound adapters (like database repositories, API clients) and managing encapsulation.
- Read the language profile for the codebase: [kotlin.md](references/languages/kotlin.md), [java.md](references/languages/java.md), [typescript.md](references/languages/typescript.md), [dart.md](references/languages/dart.md) (Dart or Flutter).
