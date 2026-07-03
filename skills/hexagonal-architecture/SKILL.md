---
name: hexagonal-architecture
description: Use when designing, implementing, or refactoring codebase layers according to Hexagonal Architecture (Ports and Adapters) principles. Trigger when creating vertical slices, setting up dependency inversion, structuring API, Application, Domain, or Infrastructure layers.
---

# Hexagonal Architecture (Ports & Adapters)

Follow these steps to design and implement codebase layers with clean boundaries, strict encapsulation, and high test confidence.

## Steps

1. **Define/Refactor Domain Logic (Inside-Out):**
   - Write production code to model the domain's core logic (aggregates, entities, value objects).
   - Ensure the Domain layer has zero framework or infrastructure dependencies.
2. **Define Outbound Ports:**
   - Declare interfaces for external resources:
     - **Domain-driven ports** (e.g., repositories, domain event publishers) belong in the Domain Layer.
     - **Integration/application-specific ports** (e.g., email clients, payment services) belong in the Application Layer.
3. **Orchestrate Usecases (Application Layer):**
   - Wire API/ingress inputs to Domain actions. Usecases must coordinate transactions, security, and orchestrate actions without containing business rules.
4. **Implement Adapters (Infrastructure & API Layers):**
   - **Outbound Adapters (Infrastructure):** Implement outbound ports. Map persistence structures to domain models; never leak persistence structures. Use access modifiers (e.g., package-private/internal) to keep adapter implementations non-public.
   - **Inbound Adapters (API):** Implement entry points (controllers, consumers). Map payloads directly to Application commands or queries, keeping them free of business logic.

## Context Pointers

- Read [domain-layer.md](references/domain-layer.md) when defining core domain entities, value objects, and domain-level outbound ports (like repositories).
- Read [application-layer.md](references/application-layer.md) when creating application use-cases, commands/queries, or application-level outbound ports (like email/SMS integration clients).
- Read [api-layer.md](references/api-layer.md) when writing inbound adapters (like HTTP/gRPC controllers, Kafka event consumers).
- Read [infrastructure-layer.md](references/infrastructure-layer.md) when writing outbound adapters (like database repositories, API clients) and managing encapsulation.
