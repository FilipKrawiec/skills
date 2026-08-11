# Aggregate Factories

Reference constraints for Aggregate Factories, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Role of an Aggregate Factory

An **`AggregateFactory`** encapsulates the creation of complex Aggregate Roots and their child entities. A factory ensures that:
- Aggregates are instantiated in a **fully valid state** with all initial invariants met.
- Initial identity generation and domain creation events (e.g. `OrderPlacedEvent`) are properly orchestrated.
- External domain dependencies (e.g. identity generators, domain calculation policies) are encapsulated without leaking infrastructure or service references into the Aggregate entity itself.

---

## 2. Structural Rules

1. **Use Standalone `AggregateFactory` Classes**: Encapsulate complex aggregate creation in a dedicated domain factory class (e.g., `OrderFactory`, `CustomerFactory`).
2. **Do Not Add `Aggregate.create(...)` Static Methods**: Static `create(...)` methods on Aggregate Roots lead to bloated aggregate classes and awkward dependency passing. Aggregate Root constructors should remain package-private or private, accessible only to their designated `AggregateFactory`.
3. **No Reconstitution / Hydration in Domain Factories**: 
   - **Domain Creation** (handled by `AggregateFactory`) creates a *new* aggregate, assigns a new ID, enforces creation rules, and registers initial domain creation events.
   - **Persistence Reconstitution** (hydrating existing aggregates from a database or ORM) is strictly an **Anti-Corruption Layer (ACL) / Infrastructure Adapter** responsibility. Do NOT put `reconstitute(...)` methods or persistence mapping logic inside `AggregateFactory` or core domain models.
4. **Boundary Translation to Value Objects**: An `AggregateFactory` translates boundary inputs (primitives from commands or DTOs) into strict Value Objects via `.of(...)` before passing them to entity constructors. Raw primitives must never leak past the factory into domain models.
