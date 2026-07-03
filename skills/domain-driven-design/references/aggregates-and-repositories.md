# Aggregates and Repositories

Reference constraints derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Vernon's 4 Rules of Aggregate Design

1. **Model Invariants Within Transactional Boundaries:**
   - An Aggregate is a transactional consistency boundary.
   - **Aggregate Roots are Entities:** The Aggregate Root is a specialized Entity (see [entities.md](entities.md)). It acts as the transactional consistency boundary for all internal entities and value objects.
   - All rules (invariants) that must be consistent immediately at the end of a transaction must be satisfied within the single Aggregate Root.
2. **Design Small Aggregates:**
   - Keep Aggregates as small as possible (ideally just the Root Entity and minimal local state/collections).
   - Large Aggregates suffer from concurrency write failures (optimistic locking conflicts), slow load times, and high memory usage.
3. **Reference Other Aggregates by Identity Only:**
   - Never reference another Aggregate Root directly by object (e.g., storing a `Customer` field inside `Order`).
   - Store only the identifier (`customerId`). This decouples contexts, keeps memory usage low, and simplifies persistence.
4. **Use Eventual Consistency Outside Transactional Boundaries:**
   - A single transaction/use-case must only mutate a **single** Aggregate Root.
   - If a change to one Aggregate requires changes to another, publish a **Domain Event** and handle the secondary update asynchronously (eventual consistency).

## 2. Repositories

- **Root-Only Access:** Provide Repositories only for Aggregate Roots. Local Entities have no Repository (e.g., query `OrderItem` through `OrderRepository`).
- **Save/Load Whole:** Repositories must save and load the Aggregate in its entirety to ensure the Aggregate Root can validate invariants.
- **Creation vs. Reconstitution:**
  - **Creation:** A new Aggregate is instantiated via a constructor or factory, generating a new ID and registering creation events (e.g., `OrderSubmitted`).
  - **Reconstitution:** Loading an existing Aggregate from the DB. **Must bypass constructor validation, rule checks, and event registration** to avoid publishing duplicate events or failing to load historical data if rules change.

```pseudocode
// Reconstitution mapping in repository (bypasses validations/events)
class SqlOrderRepository {
  function findById(orderId): Order {
    row = database.query("SELECT * FROM orders WHERE id = ?", orderId)
    if (row == null) return null

    // Directly maps persisted fields, bypassing business validations
    return Order.reconstitute(row.id, row.customerId, row.status)
  }
}
```
