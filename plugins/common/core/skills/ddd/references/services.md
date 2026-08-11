# Services

Reference constraints for Services, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Domain Services (Vernon's 3 Conditions)

Use a **Domain Service** (stateless domain operation in the Domain Layer) *only* when the task:
1. Performs a significant business process that does not naturally belong to a single Entity or Value Object.
2. Transforms a domain object from one representation to another.
3. Calculates a value that requires inputs from multiple domain objects where no single object is the natural owner.

### ⚠️ Transactional Boundary Rule
Do not mutate state on multiple aggregates in a single Domain Service. To preserve consistency boundaries, Domain Services should perform calculations or orchestrations, leaving the single aggregate root to mutate its own state.

---

## 2. Application Services

An **Application Service** (UseCase in the Application Layer) contains **no business logic**. It coordinates the transaction, security, loading, and saving of domain state via repository ports and application commands.

---

## 3. Quick Reference Matrix

| Service Type | Layer | Purpose | Mutates DB? | Examples |
| :--- | :--- | :--- | :--- | :--- |
| **Domain** | Domain | Core business calculations / transformations | No (stateless) | `OrderPricingService`, `DiscountPolicy` |
| **Application** | Application | Usecase orchestration, tx boundary, security | Yes (via repository ports) | `CheckOutUseCase`, `CancelOrderHandler` |
| **Infrastructure** | Infrastructure| Technical adapters (SMS, Emails, API client) | No (typically) | `SmtpNotificationSender`, `BcryptHasher` |
