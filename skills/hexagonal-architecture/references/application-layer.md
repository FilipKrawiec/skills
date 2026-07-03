# Application Layer

Guidelines for usecase orchestration and command/query handling in the Application Layer.

## 1. Orchestration Only (No Business Rules)
- The Application Layer contains **no business or domain logic**.
- It coordinates transactional boundaries, security, loading aggregates, invoking domain methods, and saving changes via repositories.

## 2. CQRS Pattern (Commands & Queries)
- Structure use-cases around the CQRS (Command Query Responsibility Segregation) pattern:
  - **Commands:** Mutate state. Handled by Command Handlers which coordinate transactions.
  - **Queries:** Read state. Return data transfer objects (DTOs) or read-models directly, bypassing the domain model if needed for performance.

## 3. Application Outbound Ports
- Define interfaces for integration-specific operations that are not part of the core domain logic (e.g., `EmailSender`, `PaymentProcessor`, `SmsClient`) inside the Application layer.
- This ensures the Domain layer remains completely unaware of these external services.
