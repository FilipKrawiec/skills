# Domain Layer (Core)

Guidelines for designing and implementing the Domain layer in Hexagonal Architecture, derived from DDD principles.

## 1. Zero External Dependencies
- The Domain layer must be written in plain programming language (POJOs/POCOs).
- It must contain **zero framework or infrastructure dependencies** (no database libraries, Web/REST annotations, JSON serializers, or external utility frameworks).

## 2. Business Invariants & Tactical Models
- Encapsulate business rules and invariants inside Aggregate Roots, Entities, and Value Objects.
- The state of an aggregate must only be mutated via intention-revealing domain methods on the Aggregate Root.

## 3. Domain Outbound Ports & Naming Parity
- Define interfaces for database repositories or domain-centric operations directly inside the Domain layer (e.g., package `domain.model` or `domain.repository`).
- **Domain Layer (Pure Naming):** Suffixes like `Port` or `Interface` are prohibited. Outbound port interfaces must be categorized and named as follows:
  - **Repositories (Collections):** Name as a plural collection representing the domain entity (e.g., `Threads`), keeping it strictly domain-centric and avoiding the technical `Repository` suffix.
  - **Query Ports (CQRS):** Suffix with `Queries` (e.g., `ThreadQueries`) to clearly represent a set of read operations returning Value Objects.
  - **Functional Ports (Publishers, Senders, Validators):** Use descriptive role-based/functional suffixes (e.g., `ThreadEventPublisher`, `NotificationSender`, `MergeRequestValidator`) to avoid confusion with database collections.
  - **Colocation (Single File):** In languages that support top-level declarations (e.g., Kotlin, Go), the Aggregate Root class (e.g., `Thread`) and its collection port (e.g., `Threads`) should reside in the **same source file** (e.g., `Threads.kt`) to keep the aggregate consistency boundary and its persistence access gateway tightly coupled.
- **Infrastructure Layer (Explicit/Pattern Naming):** Concrete adapter classes and helper models must prepend the technology name to the port interface name (e.g., `JPAThreads`, `JPAThreadQueries`, `KafkaThreadEventPublisher`, `SmtpNotificationSender`) to make the transport, persistence technology, and pattern explicit.

## 4. Port Invocation & Double-Dispatch
- **No Direct Infrastructure/Adapter Access:** Aggregates and Entities must never reference adapters, database clients, or global service locators.
- **Double-Dispatch for External State Queries:** If an Aggregate needs to query external state to enforce an invariant during a command, define a Domain Outbound Port interface and pass it directly into the Aggregate's business method as an argument (Double-Dispatch).
