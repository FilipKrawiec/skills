---
name: hexagonal-architecture
description: Use when designing, implementing, or refactoring codebase layers according to Hexagonal Architecture (Ports and Adapters) principles. Trigger when creating vertical slices, setting up dependency inversion, structuring API, Application, Domain, or Infrastructure layers.
---

# Hexagonal Architecture (Ports & Adapters)

Follow these steps to implement code layers with clean boundaries, strict encapsulation, and dependency inversion.

## Role of the Layers

1. **API Layer (Inbound/Ingress):**
   - Entry points to the application (e.g., HTTP controllers, Kafka event consumers).
   - Handles transport tasks (payload parsing, validation, serialization).
   - Maps requests directly to Application commands/queries, keeping them free of business logic.
2. **Application Layer:**
   - Coordinates transactions, security, and usecase orchestration.
   - Wires API inputs to Domain actions. Contains no business rules.
3. **Domain Layer (Core):**
   - Written in pure programming language with zero framework or infrastructure dependencies.
   - Encapsulates domain invariants, aggregates, and value objects.
   - Defines outbound port interfaces (e.g., `UserRepository`) using DDD terms (no "Port" suffix).
4. **Infrastructure Layer (Outbound/Egress):**
   - Implements outbound adapters (concrete persistence repositories, external API clients).
   - Maps database persistence models (tables) to/from domain entities; never leak persistence models into the Domain or Application layers.

## Key Principles

- **Dependency Inversion:** Dependencies must always point inward (API/Infrastructure $\rightarrow$ Application $\rightarrow$ Domain). The Domain/Application layers define the interface contracts, and Infrastructure implements them.
- **Encapsulation:** The core domain must not instantiate or reference any infrastructure/API classes. Persistence schemas and external transfer details must be hidden within their respective adapters.
- **Access Modifiers:** If supported by the language (e.g., `internal`, package-private, `private`), use access modifiers to hide adapter implementation details. Outbound adapter implementations and persistence models should not be public; only the port interfaces they implement should be exposed to other layers.

## Context Pointers

- Read `docs/adr/0002-domain-driven-design-and-hexagonal-architecture.md` for architectural context.
