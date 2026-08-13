# Events and Event Sourcing

Reference constraints for Events, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Domain Events (Standard state-persisted aggregates)

A **Domain Event** is a record of a state transition or significant occurrence in the past.
- **Naming:** Past-tense verbs matching the Ubiquitous Language (`ThreadCreated`, `ThreadResolved`).
- **Registration:** Aggregates register events internally during command execution. The Application Service or Repository dispatches them after a successful transaction commit (e.g. via a Transactional Outbox pattern).
- **Value-Object Payloads:** All attributes carried in a Domain Event payload MUST be typed as Value Objects (`OrderId`, `CustomerId`, `Money`, `Timestamp`), never raw primitives (`String`, `Double`, `UUID`).
- **Clearing & Rolldown:** Events published by the aggregate are cleared upon successful delivery or outbox insertion. If publishing fails, the transaction rolls back without clearing events.

---

## 2. Event-Sourced Aggregates

In Event Sourcing, the aggregate's state is not stored as a snapshot; it is rehydrated by replaying historical events.

### State Mutation Rules
- **No Direct Mutation in Commands:** Command methods validate invariants and emit events.
- **Mutate in Apply Only:** State variables must be updated **exclusively** inside private `apply` handlers, ensuring command execution and historical event rehydration share the same code path.
- **Rehydration:** Aggregate rehydration on load loops through historical events and passes each to the internal `apply` handler without emitting new uncommitted events.

---

## 3. Core Architecture Rules

- **Transactional Outbox:** Write events to a persistent outbox table in the same transaction as the aggregate write. A background process publishes them to ensure at-least-once delivery (avoiding dual-writes).
- **Upcasters:** Use event upcasting (converters that translate old event schemas to new formats in-memory) to handle event schema version changes.
