---
name: hexagonal-architecture
description: Use when designing, implementing, or refactoring codebase layers with Ports and Adapters, including API, application, domain, infrastructure, and dependency-boundary decisions.
---

# Hexagonal Architecture (Ports & Adapters)

Use these steps to preserve dependency direction and encapsulation.

## Mandatory Steps

1. **Read Reference Files First**: You MUST read the applicable language reference file in `references/languages/` (e.g. [kotlin.md](references/languages/kotlin.md) or [typescript.md](references/languages/typescript.md)) and applicable layer reference files in `references/` BEFORE proposing or writing package structures, ports, adapters, or code.
2. **Feature-First Package Boundaries**: Use feature-first packages with layer suffixes (`<feature>.domain`, `<feature>.app`, `<feature>.api`, `<feature>.infra`). Never use top-level layer-first packages (`domain`, `adapter`).
3. **Domain Port Naming Parity**: Domain outbound ports MUST NOT use technical suffixes like `Port` or `Repository` (e.g., use `Users` or `ApplicationMetadatas`). Outbound adapters MUST prepend technology names (e.g., `JpaUsers`, `AgroalApplicationMetadatas`).
4. **Zero Framework Dependencies in Domain**: Keep the Domain layer free of web/REST annotations, database libraries, ORMs, JSON serializers, and framework types.
5. **Layered Outbound Ports**: Declare outbound ports at the layer that owns the policy: domain-driven ports in Domain; integration-specific ports in Application.
6. **Application Orchestration**: Let Application use cases coordinate transactions, security, and Domain actions without business rules.
7. **Adapters at the Edge**: Inbound adapters map requests to commands/queries; outbound adapters map ports to external systems without leaking data models.
8. **Layer-Scoped Reuse**: Keep technical reuse layer-scoped. A DDD Shared Kernel is domain-only and jointly owned by its named Bounded Contexts; it is never a cross-layer component library.

## Context Pointers

- Read [domain-layer.md](references/domain-layer.md) when defining core domain entities, value objects, and domain-level outbound ports (like repositories).
- Read [application-layer.md](references/application-layer.md) when creating application use-cases, commands/queries, or application-level outbound ports (like email/SMS integration clients).
- Read [api-layer.md](references/api-layer.md) when writing inbound adapters (like HTTP/gRPC controllers, Kafka event consumers).
- Read [infrastructure-layer.md](references/infrastructure-layer.md) when writing outbound adapters (like database repositories, API clients) and managing encapsulation.
- Read [kotlin.md](references/languages/kotlin.md) when applying these boundaries in a Kotlin codebase.
- Read [typescript.md](references/languages/typescript.md) when applying these boundaries in a TypeScript codebase.
