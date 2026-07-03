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

## 3. Large/Endless Collections (The Local Entity Growth Problem)

Even if a child entity has no conceptual meaning outside its parent context (e.g., a `Thread` inside a `MergeRequest`), **it must be promoted to a standalone Aggregate Root referencing the parent by ID if the collection can grow indefinitely.** This prevents performance issues (memory bloat) and optimistic locking concurrency conflicts.

### Enforcing Invariants via Query-Based Validation

If the parent Aggregate has invariants that depend on the state of the collection (e.g., *"Cannot merge if there are unresolved threads"*), enforce them by querying the child repository at the Application Layer boundary, rather than loading the collection into the parent aggregate.

```pseudocode
// Thread is promoted to its own Aggregate Root, referencing MergeRequest by ID
class Thread {
  private id: ThreadId
  private mrId: MergeRequestId
  private isResolved: boolean = false

  function resolve() {
    this.isResolved = true
  }
}

// Application Layer: Enforces the invariant using a fast repository query
class MergeMergeRequestUseCase {
  constructor(mrRepository, threadRepository) {
    this.mrRepository = mrRepository
    this.threadRepository = threadRepository
  }

  function execute(command) {
    this.unitOfWork.transaction(() -> {
      mr = this.mrRepository.findById(command.mrId)
      if (mr == null) raise Error("Merge request not found")

      // Invariant validation: check for unresolved threads via repository query
      hasUnresolved = this.threadRepository.hasUnresolvedThreads(mr.id)
      if (hasUnresolved) {
        raise Error("Cannot merge: there are unresolved threads")
      }

      mr.merge()
      this.mrRepository.save(mr)
    })
  }
}
```
