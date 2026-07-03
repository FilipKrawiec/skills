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
   - Never reference another Aggregate Root directly by object (e.g., storing a `MergeRequest` field inside `Thread`).
   - Store only the identifier (`mergeRequestId`). This decouples contexts, keeps memory usage low, and simplifies persistence.
4. **Use Eventual Consistency Outside Transactional Boundaries:**
   - A single transaction/use-case must only mutate a **single** Aggregate Root.
   - If a change to one Aggregate requires changes to another, publish a **Domain Event** and handle the secondary update asynchronously (eventual consistency).

## 2. Repositories

- **Root-Only Access:** Provide Repositories only for Aggregate Roots. Local Entities have no Repository (e.g., query `Comment` through the `Threads` collection).
- **Save/Load Whole:** Repositories must save and load the Aggregate in its entirety to ensure the Aggregate Root can validate invariants.
- **Creation vs. Reconstitution:**
  - **Creation:** A new Aggregate is instantiated via a constructor or factory, generating a new ID and registering creation events (e.g., `ThreadCreated`).
  - **Reconstitution:** Loading an existing Aggregate from the DB. **Must bypass constructor validation, rule checks, and event registration** to avoid publishing duplicate events or failing to load historical data if rules change.

```pseudocode
// Reconstitution mapping in repository adapter (bypasses validations/events)
class JPAThreads implements Threads {
  function findById(threadId): Thread {
    row = database.query("SELECT * FROM threads WHERE id = ?", threadId)
    if (row == null) return null

    // Directly maps persisted fields, bypassing business validations
    return Thread.reconstitute(row.id, row.mergeRequestId, row.status)
  }
}
```

- **Lightweight Query Methods (Count, Existence, and Summaries):** Avoid loading full entities or collections just to perform existence checks, counts, or basic calculations. Expose explicit query methods directly on the collection port interface (e.g., `exists(id): boolean` or `countUnresolved(parentId): number`). The concrete implementation (e.g., `JPAThreads`) must execute lightweight database queries (e.g., `EXISTS` or `SELECT COUNT(*)`) rather than rehydrating domain objects into memory.

## 3. Large/Endless Collections (The Local Entity Growth Problem)

Even if a child entity has no conceptual meaning outside its parent context (e.g., a `Thread` inside a `MergeRequest`), **it must be promoted to a standalone Aggregate Root referencing the parent by ID if the collection can grow indefinitely.** This prevents performance issues (memory bloat) and optimistic locking concurrency conflicts.

### Enforcing Invariants via Query-Based Validation

If the parent Aggregate has invariants that depend on the state of the collection (e.g., *"Cannot merge if there are unresolved threads"*), do not load the collection. Use one of two query-based approaches:

#### Approach A: Application-Level Query Validation
Query a check method on the collection port in the Application Service before invoking the aggregate action:
```pseudocode
class MergeMergeRequestUseCase {
  function execute(command) {
    this.unitOfWork.transaction(() -> {
      mr = this.mergeRequests.findById(command.mrId)
      if (mr == null) raise Error("Merge request not found")
      
      // Invariant check via outbound port query
      if (this.threads.hasUnresolvedThreads(mr.id)) {
        raise Error("Cannot merge: unresolved threads exist")
      }
      
      mr.merge()
      this.mergeRequests.save(mr)
    })
  }
}
```

#### Approach B: Double-Dispatch via Domain Service / Port (Preferred for Strict Encapsulation)
Define a domain-level service or validation interface in the Domain layer, and pass it directly to the aggregate's business method:
```pseudocode
interface MergeRequestValidator {
  hasUnresolvedThreads(mrId): boolean
}

class MergeRequest {
  function merge(validator: MergeRequestValidator) {
    if (validator.hasUnresolvedThreads(this.id)) {
      raise Error("Cannot merge: unresolved threads exist")
    }
    this.status = "Merged"
  }
}

## 4. Repository vs. DAO (Data Access Object)

| Aspect | Repository (DDD) | DAO (Data Access Object) |
| :--- | :--- | :--- |
| **Layer** | **Domain Layer** (as an Outbound Port contract). | **Infrastructure Layer** (internal persistence component). |
| **Abstraction** | Mimics an **in-memory collection** of Domain Objects (Aggregate Roots). | Mimics **database tables, schemas, or queries** (CRUD operations). |
| **Concept** | Domain-centric (Domain language, entities, value objects). | Database-centric (Tables, rows, ORM models, SQL queries). |
| **Granularity** | Operates at the **Aggregate Root level** only (saves/loads entire aggregates). | Operates at the **data row/entity level** (fine-grained table CRUD). |
| **Exposure** | **Public Outbound Port** exposed to the Application layer. | **Private/Internal utility** hidden inside the Infrastructure layer. |

- **Design Guideline:** Never use a DAO directly in the Domain or Application layers. If an Application use-case or domain invariant requires checking database state (e.g., uniqueness validator), define a domain-centric Outbound Port (e.g., `EmailUniqueness`) and implement it in the Infrastructure layer, utilizing a private DAO to perform the query.

## 5. CQRS & Query Ports returning Value Objects

To query complex projections, dashboards, or tabular reports without overloading the write-side Repository or loading entire Aggregates (performance cost):

1. **Bypass the Domain Write Model:** Define a dedicated Query Port (e.g., `ThreadQueries`) in the Domain layer.
2. **Return Domain Value Objects:** The Query Port must return immutable **Value Objects** (e.g., `ThreadSummary`) defined in the Domain layer. This preserves domain-level schema ownership and enables attaching business behavior directly to the returned objects (e.g., `ThreadSummary.isResolved()`).
3. **Use a Private DAO in Infrastructure:** The implementation adapter (e.g., `JPAThreadQueries` in Infrastructure) executes optimized database queries (raw SQL or projections) via a private `ThreadsDao`, mapping tabular rows directly into the Domain's `ThreadSummary` Value Objects.
```
