---
name: hexagonal-architecture
description: Use when designing, implementing, or refactoring codebase layers according to Hexagonal Architecture (Ports and Adapters) principles. Trigger when creating vertical slices, setting up dependency inversion, structuring API, Application, Domain, or Infrastructure layers.
---

# Hexagonal Architecture (Ports & Adapters)

Follow these steps to design and implement codebase layers with clean boundaries, strict encapsulation, and high test confidence.

## Steps

1. **Define/Refactor Domain Logic (Inside-Out):**
   - Write unit tests to drive the creation of pure domain models (aggregates, entities, and value objects) encapsulating business invariants. Do not mock collaborating domain objects (Chicago Strategy).
   - Ensure the Domain layer has zero framework or infrastructure dependencies.
2. **Define Outbound Ports:**
   - Declare interfaces for external resources (e.g., database repositories, external clients) inside the Domain or Application layer.
   - Use Ubiquitous Language terms for names (e.g., `UserRepository`, not `UserRepositoryPort`).
3. **Orchestrate Usecases (Application Layer):**
   - Wire API/ingress inputs to Domain actions. Usecases must coordinate transactions, security, and orchestrate actions without containing business rules.
   - Write component tests using real domain objects (ideally without mocks) to verify usecase flows, aiming for 100% test branch coverage for confidence.
4. **Implement Adapters (Infrastructure & API Layers):**
   - **Outbound Adapters (Infrastructure):** Implement outbound ports (repositories, external clients). Map persistence structures to domain models; never leak persistence structures. Use access modifiers (e.g., package-private/internal) to keep adapter implementations non-public.
   - **Inbound Adapters (API):** Implement entry points (controllers, consumers). Map payloads directly to Application commands or queries, keeping them free of business logic.

## Context Pointers

- Read [0002-domain-driven-design-and-hexagonal-architecture.md](file:///Users/filip/Developer/projects/github.com/FilipKrawiec/skills/docs/adr/0002-domain-driven-design-and-hexagonal-architecture.md) for detailed layer definitions and architectural rules.
- Read [0003-test-driven-development.md](file:///Users/filip/Developer/projects/github.com/FilipKrawiec/skills/docs/adr/0003-test-driven-development.md) for guidelines on TDD and the Chicago Strategy.
