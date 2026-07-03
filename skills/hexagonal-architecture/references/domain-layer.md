# Domain Layer (Core)

Guidelines for designing and implementing the Domain layer in Hexagonal Architecture, derived from DDD principles.

## 1. Zero External Dependencies
- The Domain layer must be written in plain programming language (POJOs/POCOs).
- It must contain **zero framework or infrastructure dependencies** (no database libraries, Web/REST annotations, JSON serializers, or external utility frameworks).

## 2. Business Invariants & Tactical Models
- Encapsulate business rules and invariants inside Aggregate Roots, Entities, and Value Objects.
- The state of an aggregate must only be mutated via intention-revealing domain methods on the Aggregate Root.

## 3. Domain Outbound Ports
- Define interfaces for database repositories or domain-centric operations directly inside the Domain layer (e.g. package `domain.model` or `domain.repository`).
- Use Ubiquitous Language terms for port names (e.g., `UserRepository` or `OrderEventPublisher`, **not** `UserRepositoryPort` or `UserRepositoryInterface`).
