# Architectural Fitness, System Qualities & Boundary Governance

This reference details Solution Architect review criteria for evaluating system boundaries, modular cohesion, operational reliability, and architectural doctrines.

---

## 1. Boundary Integrity & Dependency Direction

Audit code changes against architectural layer rules and dependency flow:

| Boundary Rule | Requirement & Invariant | Violation Indicator | Architect Remediation |
| :--- | :--- | :--- | :--- |
| **Hexagonal Dependency Rule** | Dependencies point strictly inward toward `domain/`. `domain/` must never import `application/`, `infrastructure/`, or `api/`. | Domain entity imports an HTTP client, database driver, or serialization library. | Extract a port interface in `domain/` or `application/`; implement adapter in `infrastructure/`. |
| **Domain Purity** | Domain entities, aggregates, and value objects must be plain objects with zero framework annotations (e.g. ORM decorators, HTTP schemas). | Domain class uses JPA/GORM annotations, JSON serializers, or framework base classes. | Separate domain models from persistence entities; map via repository adapters. |
| **Encapsulated Aggregate Roots** | Entities within an aggregate must be modified exclusively through the Aggregate Root to protect invariants. | External service traverses root and directly mutates child entities (`order.getItems().get(0).setPrice(...)`). | Route mutations through Aggregate Root methods that validate business invariants. |
| **Context Isolation** | Bounded contexts must communicate via explicit Anti-Corruption Layers (ACL), published domain events, or Open-Host APIs. | Direct cross-database joins, shared mutable tables, or raw model sharing between distinct bounded contexts. | Introduce an ACL translator, Value Object adapter, or asynchronous event contract. |

---

## 2. Component Cohesion, Coupling & Blast Radius

Evaluate modularity and change localization:

| Metric / Dimension | Target State | Architectural Risk & Anti-Pattern | Review Action |
| :--- | :--- | :--- | :--- |
| **Cohesion** | High: classes and modules group elements that change for the same business reasons. | Mixed concerns: parsing, domain logic, and persistence coupled in a single handler. | Partition into Application Service (orchestration), Domain (logic), and Adapters (I/O). |
| **Coupling** | Low & Loose: components depend on abstract contracts, not concrete implementations. | Concretions instantiated directly (`new PostgresRepository()`) inside business services. | Apply Dependency Injection; inject port interfaces into constructors. |
| **Blast Radius** | Small: changes to an internal implementation detail do not force modifications in upstream consumers. | Public contract changes leaking database schema columns or internal representation types. | Wrap internal representation in stable public DTOs or Value Objects. |
| **Module Depth** | Deep: simple, minimal interfaces that hide substantial internal complexity. | Shallow modules: classes with 1:1 passthrough wrappers that duplicate signatures without adding value. | Inline trivial passthrough wrappers; consolidate into deep cohesive modules. |

---

## 3. Operational Fitness & Resilience

Inspect changes for operational robustness and systemic safety:

| System Quality | Design Expectation | Vulnerability Pattern | Architect Remediation |
| :--- | :--- | :--- | :--- |
| **Idempotency** | Repeating a mutating command or message delivery produces identical final state without duplicate side-effects. | Retrying a failed payment or entity creation creates duplicate records or double charges. | Introduce idempotency keys, natural unique constraints, or state check guards. |
| **Failure Domains** | Failures in external downstream dependencies are isolated and do not cascade to crash core workflows. | Unbounded blocking calls to 3rd party APIs without timeouts or fallbacks. | Wrap external calls in circuit breakers, timeouts, retries with backoff, and bulkhead pools. |
| **State Lifecycle** | Entity state transitions are explicit, validated by finite state machines, and protect consistency. | Arbitrary setting of status fields (`order.status = "COMPLETED"`) skipping intermediate state checks. | Enforce state transitions through guarded domain methods (`order.complete(paymentConfirmation)`). |
| **Data Consistency** | Transaction boundaries encapsulate a single Aggregate Root per transaction. | Distributed transactions spanning multiple aggregates or cross-context database writes. | Scope transactions to one aggregate root; coordinate cross-aggregate changes via domain events. |

---

## 4. Anti-Overengineering Invariants

Prevent architectural bloat and premature complexity:

| Invariant | Principle | Enforcement Rule |
| :--- | :--- | :--- |
| **Rule of Two Adapters** | Do not introduce an interface or abstraction layer unless at least two distinct concrete implementations exist in active code. | If only one database adapter exists, depend on the concrete adapter until a second adapter (e.g. in-memory test stub or alternate vendor) is introduced. |
| **YAGNI (You Aren't Gonna Need It)** | Implement only the behavior required by active acceptance criteria. | Reject speculative configuration flags, unused extension points, and preemptive plugin hooks. |
| **DTO Proliferation Ban** | Avoid chains of 1:1 identical data-transfer objects across internal adjacent layers. | Pass domain Value Objects directly where boundary translation is not strictly necessary. |
