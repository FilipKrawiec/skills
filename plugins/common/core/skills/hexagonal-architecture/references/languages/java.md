# Java & Spring Boot Hexagonal Architecture

Use this as a Java-specific delta on top of the generic Domain, Application, API, and Infrastructure layer references.

## 1. Package and Module Boundaries

- Organize bounded contexts in packages: `com.example.<context>.domain`, `com.example.<context>.application`, `com.example.<context>.api`, and `com.example.<context>.infrastructure`.
- The `domain` package must be free of framework imports (zero `jakarta.persistence.*`, `org.springframework.*`, or `com.fasterxml.jackson.*`).
- Enforce package dependency direction using [ArchUnit](https://www.archunit.org/) unit tests.

## 2. Aggregate Roots & Value Objects

- Model Aggregate Roots as Java classes with private constructors/fields and public domain mutation methods enforcing business invariants.
- Model Value Objects using Java `record` types (immutable, value-based equality, and validation in canonical/compact constructors).
- Throw domain-specific exceptions (extending `RuntimeException` or checked domain exceptions) for invariant violations.

## 3. Ports & Adapters Naming Parity

- Declare Domain Outbound Ports (e.g., repository interfaces) in the `domain` package with plural nouns and no `Port`/`Repository` suffix: `public interface Users`.
- Prepend technology names on concrete adapters in `infrastructure`: `JpaUsers`, `MongoUsers`, `KafkaEventPublisher`.
- Declare integration ports (e.g., `PaymentClient`) in the `application` package.

## 4. Application Layer & Use Cases

- Application services (e.g., `CreateUserUseCase`, `PlaceOrderHandler`) coordinate transactions via `@Transactional`, load aggregates via domain ports, invoke domain methods, and persist changes.
- Application use cases must never leak persistence or ORM entities to API controllers; return application-specific DTOs or domain Value Objects.

## 5. Inbound & Outbound Adapters

- **Inbound Adapters (`api`)**: Spring `@RestController` or gRPC services map HTTP requests to application commands, validate inputs via `@Valid` DTOs, and invoke application services. Never inject or invoke domain repository ports directly from REST controllers.
- **Outbound Adapters (`infrastructure`)**: Implement port interfaces using Spring Data JPA (`@Repository`), JDBC, or REST clients. Use explicit mapper classes (`UserEntityMapper`) to convert between JPA `@Entity` classes and pure domain Aggregates.
