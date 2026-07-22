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
  - **Colocation:** In languages that support top-level declarations, small aggregate-local types and the collection port may live beside the Aggregate Root when that makes the aggregate boundary easier to audit.
- **Infrastructure Layer (Explicit/Pattern Naming):** Concrete adapter classes and helper models must prepend the technology name to the port interface name (e.g., `SqlThreads`, `SqlThreadQueries`, `KafkaThreadEventPublisher`, `SmtpNotificationSender`) to make the transport, persistence technology, and pattern explicit.

## 4. External State and Invariants
- **No Direct Infrastructure/Adapter Access:** Aggregates and Entities must never reference adapters, database clients, or global service locators.
- **Prefer Facts Over IO:** If an invariant depends on external state, the Application layer or a Domain Service should query the needed port and pass the resulting domain fact, policy, or decision into the Aggregate.
- **Double-Dispatch Exception:** Passing a domain-named port into an Aggregate method is allowed only when the port is pure, explicitly part of enforcing the invariant, and does not make the Aggregate perform infrastructure-shaped work.
