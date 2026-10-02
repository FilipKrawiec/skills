# Aggregate Creation and Factories

Reference constraints for creating Aggregates, derived from Vaughn Vernon's *Implementing Domain-Driven Design* and expressed in the idiom each language profile prescribes.

## 1. One Creation Entry per Aggregate

Every Aggregate has exactly one creation entry in the Domain layer. It:
- Yields an Aggregate in a **fully valid state** with every creation invariant met, or reports the violation in the domain's failure form.
- Assigns the initial identity and records the creation Domain Event (e.g. `OrderPlaced`).
- Receives Value Objects, never raw primitives: the caller (application service or inbound adapter) converts boundary input through each Value Object's creation entry before calling it.

Where the entry lives follows the language profile in `hexagonal-architecture/references/languages/`: a static or companion `create` on the root, a factory constructor, or a pure `createOrder(...)` function beside the aggregate. The profiles agree on the rule and differ only in the encoding.

## 2. When a Separate Factory Is Justified

Move creation into a dedicated domain factory (e.g. `OrderFactory`) only when creation needs collaborators the root must not hold: injected identity or clock ports, domain policies, or checks against other domain objects. A separate factory exposes one `create` and keeps the root's constructor private to the domain.

## 3. Creation Is Not Reconstitution

- **Creation** makes a *new* aggregate: new identity, creation rules, creation events.
- **Reconstitution** rebuilds an existing aggregate from storage. It is an Infrastructure adapter concern: keep persistence mapping and hydration inside the repository implementation, and add no `reconstitute(...)` or persistence constructor to the domain model.
