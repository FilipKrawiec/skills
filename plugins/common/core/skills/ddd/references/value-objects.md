# Value Objects

Reference constraints for designing Value Objects, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Core Principles

1. **Zero Primitive Leakage in Domain Models**: Entities, Aggregate Roots, Domain Events and Domain Service parameters carry Value Objects (`EmailAddress`, `Money`, `Quantity`, `OrderId`), never raw language primitives. Raw primitives are permitted at the outer boundary and in Application Command DTOs; they cross into the domain only through a Value Object's creation entry.
2. **Form Invariance**: Outer layers (Application, Adapters) consume Domain Value Objects freely and never alter their domain form.
3. **No Identity**: Value Objects describe, measure, or quantify a domain concept. Two instances are equal when all their attributes are equal.
4. **Immutability & Replacement**: State cannot change after creation. To modify a Value Object, construct and return a new instance (`withXxx(...)` or a domain operation).
5. **Self-Validating**: A Value Object can never exist in an invalid state. Validation happens once, at creation.
6. **Side-Effect-Free Behavior**: Methods on a Value Object are pure functions returning new instances.

---

## 2. Creation Standard: One Validating Entry

Each Value Object has exactly one creation entry that validates its invariants; nothing else constructs it. The encoding follows the language profile in `hexagonal-architecture/references/languages/`:

| Profile | Encoding |
| --- | --- |
| Java | `record` with validation in the compact constructor, or a private constructor behind a static `of(...)` |
| Kotlin | `value class` or class with a private constructor and a validating `of(...)`/`invoke` on the companion |
| TypeScript | branded type with one parsing function (`emailAddress(raw)`) as the only producer of the brand |
| Dart | `extension type` or immutable class with a validating factory constructor |

Validation failure takes the domain's failure form for that profile: a domain exception in exception-based models, a result or union outcome in outcome-based ones. Both forms satisfy this rule; the profile picks one and the whole domain uses it.
