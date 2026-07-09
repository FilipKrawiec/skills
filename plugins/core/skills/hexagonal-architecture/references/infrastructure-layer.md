# Infrastructure Layer (Outbound/Egress Adapters)

Guidelines for implementing outbound adapters and managing encapsulation boundaries.

## 1. Outbound Adapters
- Implement all outbound ports defined in the Domain and Application layers (e.g., database repositories, HTTP clients for external services, message queue publishers).

## 2. Persistence Model Separation & DAOs
- Define database-specific models (e.g., ORM entities, SQL mapping schemas) within the Infrastructure layer.
- **Never leak persistence structures** to the Domain or Application layers. Map persistence models to/from clean domain models inside the adapter implementation.
- **Data Access Objects (DAOs):** Implementations that wrap raw database access and mapping belong strictly in the Infrastructure layer as private helpers. They must never be exposed as Outbound Ports. Instead, they map database queries/tables to Domain-owned models (like Entities or Value Objects) inside the Outbound Adapter implementations.

## 3. Encapsulation & Visibility
- Concrete adapter classes, persistence models, and infrastructure configurations should use non-public access modifiers where supported by the language (e.g., `internal` in C#/Kotlin, package-private in Java, private modules in Rust/Go) to prevent them from leaking or being imported elsewhere.
- Only the port interfaces they implement should be public.
- **Dependency Injection Wiring:** To register these non-public adapters at the application entry point (Composition Root) without exposing them:
  - In frameworks like Spring, use reflection-based component scanning (components remain package-private).
  - In other environments, use assembly-scanning (e.g., Scrutor in C#), language-level friend assemblies (`[assembly: InternalsVisibleTo]`), or keep them private to the infrastructure module/package and expose registration via a single public configuration helper.
