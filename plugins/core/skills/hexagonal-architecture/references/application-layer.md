# Application Layer

Guidelines for usecase orchestration and command/query handling in the Application Layer.

## 1. Orchestration Only (No Business Rules)
- The Application Layer contains **no business or domain logic**.
- It coordinates transactional boundaries, security, loading aggregates, invoking domain methods, and saving changes via repositories.

## 2. CQRS Pattern (Commands & Queries)
- Structure use-cases around the CQRS (Command Query Responsibility Segregation) pattern:
  - **Commands:** Mutate state. Handled by Command Handlers which coordinate transactions.
  - **Queries:** Read state:
    - **Domain-centric queries:** If the read-model represents business-relevant concepts with behaviors, return Domain-owned **Value Objects** (e.g., `OrderSummary`) via a query port defined in the Domain layer.
    - **Application-centric queries:** If the read-model consists of flat, UI-specific, or integration-specific data with no domain behavior, return data transfer objects (DTOs) via an application-level query port (defined in the Application layer), bypassing the domain model entirely.

## 3. Application Outbound Ports
- Define interfaces for integration-specific operations that are not part of the core domain logic (e.g., `PaymentProcessor`, `SmsClient`, `StorageClient`) inside the Application layer.
- This ensures the Domain layer remains completely unaware of these external services.
