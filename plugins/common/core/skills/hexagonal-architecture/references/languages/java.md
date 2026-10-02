# Java Hexagonal Architecture

Use this as a Java-specific delta on top of the generic Domain, Application, API, and Infrastructure layer references. It prescribes no framework: match the one the codebase already uses.

## 1. Package and Module Boundaries

- Organize bounded contexts in packages: `com.example.<context>.domain`, `com.example.<context>.application`, `com.example.<context>.api`, and `com.example.<context>.infrastructure`.
- The `domain` package is free of framework imports: no persistence, web, dependency-injection or serialization annotations.
- Enforce package dependency direction with architecture tests (e.g. ArchUnit) or module boundaries.

## 2. Aggregate Roots & Value Objects

- Model Aggregate Roots as classes with private constructors and fields and public domain methods that enforce invariants.
- Model Value Objects as `record` types: immutable, value-based equality, validation in the compact constructor or a static `of(...)`.
- Report invariant violations with domain-specific exceptions; the domain uses exceptions, not result types, so callers and tests expect one form.

## 3. Ports & Adapters Naming Parity

- Declare domain outbound ports in `domain` as plural nouns with no `Port`/`Repository` suffix: `public interface Users`.
- Prepend technology names on concrete adapters in `infrastructure`: `JpaUsers`, `MongoUsers`, `KafkaEventPublisher`.
- Declare integration ports (e.g. `PaymentClient`) in `application`.

## 4. Creation, Time, and Randomness

- Simple aggregate creation is a static `create(...)` on the root that returns a valid aggregate and its creation event.
- Use a separate factory class only when creation needs injected collaborators (identity or clock ports, policies).
- Inject `Clock` or an `OrderIds` port when time or identity must be deterministic in tests or coordinated externally.

## 5. Application Layer & Use Cases

- Application services (`CreateUserUseCase`, `PlaceOrderHandler`) open the transaction with the host framework's mechanism, load aggregates through domain ports, invoke domain methods, and persist changes.
- Use cases never return persistence entities to inbound adapters; return application DTOs or domain Value Objects.

## 6. Inbound & Outbound Adapters

- **Inbound (`api`)**: REST controllers, gRPC services and message consumers map requests to application commands, validate payload structure, and invoke application services. They never call domain repository ports directly.
- **Outbound (`infrastructure`)**: implement port interfaces with the persistence or client technology the codebase uses. Explicit mapper classes (`UserEntityMapper`) convert between persistence entities and domain aggregates; persistence annotations stay on the persistence entity.
