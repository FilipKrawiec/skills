# Value Objects

Reference constraints for designing Value Objects, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Core Principles & Strict Value-Object Scope

1. **Zero Primitive Leakage in Domain Models**: 
   - **Forbidden in Domain Layer**: Never use raw language primitives (`String`, `Double`, `Int`, `Long`, `UUID`, `Boolean`) directly as attributes in Entities, Aggregate Roots, Domain Events, or Domain Service parameters.
   - **Mandatory Value Objects**: Wrap all domain concepts in explicit Value Objects (e.g., `EmailAddress`, `Money`, `Quantity`, `Percentage`, `OrderId`, `CustomerName`, `AccountStatus`).
   - **Boundary Isolation**: Raw primitives are permitted strictly at the outer system boundary (REST DTOs, JSON payloads, DB persistence columns). Boundary primitives must be validated and converted into Value Objects via `.of(...)` before crossing into the application or domain layers.
2. **No Identity**: Value Objects describe, measure, or quantify a domain concept. Two instances are equal if all their attributes are equal.
3. **Immutability & Replacement**: State cannot be changed after creation. All fields must be read-only. To modify a Value Object, construct and return a new instance (`withXxx(...)` or domain operations).
4. **Self-Validating & Invariant Protection**: A Value Object can never exist in an invalid state. Validation occurs upon creation inside `.of(...)`.
5. **Side-Effect-Free Behavior**: Methods on a Value Object are pure functions returning new instances.

---

## 2. Creation Standard: The `.of(...)` Static Factory Method

All Value Objects must use a static `.of(...)` factory method as their sole creation interface. Keep constructors private or protected.

- In object-oriented domain models, `.of(...)` throws an explicit `InvariantViolationException` when validation fails.
- *(Note for functional paradigms: `.of(...)` may return a `Result` or `Either` type containing the validated Value Object or a list of validation errors.)*
