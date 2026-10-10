# Aggregates and Repositories

## Aggregates

- Keep an aggregate to its root plus the minimum state its immediate invariants need.
- Reference another aggregate by its identifier Value Object only, never by object.
- Mutate exactly one aggregate per use case; propagate changes to others through a domain event.
- Promote a child to its own aggregate root (referencing the parent by ID) whenever its collection can grow without bound, even if it means nothing outside the parent.
- When a parent invariant depends on such a collection ("no merge while threads are unresolved"), never load the collection. Prefer passing a domain-named check port into the aggregate method; otherwise query it in the application service before calling the aggregate.

## Repositories

- Provide repositories for aggregate roots only; reach local entities through their root.
- Load and save the whole aggregate.
- Name the port as a plural collection (`Threads`).
- Add explicit lightweight query methods (`exists(id)`, `countUnresolved(parentId)`) instead of loading aggregates to count or test existence; the adapter runs an `EXISTS`/`COUNT` query.
- Hydration from storage stays in the infrastructure adapter. Never add a public `reconstitute(...)` or persistence constructor to the root.
- A DAO is a private helper inside an infrastructure adapter, never a port and never imported by domain or application. A database-backed check (uniqueness) is a domain-named port (`EmailUniqueness`) whose adapter uses the DAO.

## Query ports

- Serve projections and reports through a `Queries` port (`ThreadQueries`) in the domain, returning domain Value Objects (`ThreadSummary`) built through their creation entry, not aggregates.
- Read-only data with no domain behaviour goes through an application-level query port returning DTOs instead.
