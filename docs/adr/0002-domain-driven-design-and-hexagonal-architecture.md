# ADR-0002: Use Domain-Driven Design and Hexagonal Architecture for Clean Separation

## Decision

We will structure systems using Domain-Driven Design (DDD) and Hexagonal Architecture (Ports and Adapters) principles to ensure highly maintainable, decoupled codebases. 

The architecture is governed by the following rules:

1. **Domain Layer (Core):**
   - Must be written in plain programming language with zero framework or infrastructure dependencies.
   - Outbound ports (e.g. database/external resource interfaces) are defined here using DDD naming conventions (e.g., `UserRepository`, not `UserRepositoryPort`).
   - The domain must not instantiate or reference any infrastructure or API class.
   - Business invariants are encapsulated within aggregates.

2. **Application Layer:**
   - Follows the CQRS (Command Query Responsibility Segregation) pattern.
   - Strictly handles orchestration, security, and transaction boundaries (wires API/ingress inputs to domain actions).
   - Contains no domain or business rules.

3. **API Layer (Inbound/Ingress):**
   - Contains entry points to the application (e.g., HTTP/REST controllers, gRPC handlers, Kafka event consumers/listeners).
   - Handles transport-level duties (payload parsing, validation, HTTP response statuses, Kafka commit controls).
   - Maps incoming request payloads directly to Application commands/queries, keeping them free of business logic.

4. **Infrastructure Layer (Outbound/Egress):**
   - Implements outbound adapters (e.g., database repositories, external HTTP/gRPC client implementations, Kafka event producers/publishers).
   - Persistence models (e.g., database table models) must be defined here and mapped to/from clean domain models; they must never leak into the domain or application layers.
   - Concrete adapter implementations, persistence models, and internal infrastructure classes/interfaces should use language-specific access modifiers (e.g., `internal`, package-private, or private) to remain non-public where supported; only the port interfaces they implement should be public.

## Context

Agents frequently take shortcuts, mix concerns, and think horizontally (e.g., database-first or framework-first development). This leads to leaky abstractions and rigid codebases. 

## Consequences

- Agents are constrained to model the domain first using pure language code.
- Infrastructure details (like SQL schemas or HTTP client libraries) are isolated, enabling adapters to be swapped or refactored with minimal risk to business logic.
- We must provide a concrete skill (`domain-driven-design`) to guide agents in this architecture.
