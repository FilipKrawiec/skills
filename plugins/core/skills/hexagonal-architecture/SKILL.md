---
name: hexagonal-architecture
description: Use when designing, implementing, or refactoring codebase layers with Ports and Adapters, including API, application, domain, infrastructure, and dependency-boundary decisions.
---

# Hexagonal Architecture (Ports & Adapters)

Use these steps to preserve dependency direction and encapsulation.

## Steps

1. Keep the Domain layer free of framework and infrastructure dependencies.
2. Declare outbound ports at the layer that owns the policy: domain-driven ports in Domain; integration-specific ports in Application.
3. Let Application use cases coordinate transactions, security, and Domain actions without business rules.
4. Keep adapters at the edge: inbound adapters map requests to commands/queries; outbound adapters map ports to external systems without leaking their data models.
5. Keep technical reuse layer-scoped. A DDD Shared Kernel is domain-only and jointly owned by its named Bounded Contexts; it is never a cross-layer component library.

## Context Pointers

- Read [domain-layer.md](references/domain-layer.md) when defining core domain entities, value objects, and domain-level outbound ports (like repositories).
- Read [application-layer.md](references/application-layer.md) when creating application use-cases, commands/queries, or application-level outbound ports (like email/SMS integration clients).
- Read [api-layer.md](references/api-layer.md) when writing inbound adapters (like HTTP/gRPC controllers, Kafka event consumers).
- Read [infrastructure-layer.md](references/infrastructure-layer.md) when writing outbound adapters (like database repositories, API clients) and managing encapsulation.
- Read [kotlin.md](references/languages/kotlin.md) when applying these boundaries in a Kotlin codebase.
