# Integration Testing

## 1. Downstream API Simulators
- Configure the application with local, lightweight HTTP/gRPC stub/mock servers rather than making live network calls to staging or external sandboxes.
- Ensure all downstream stubs boot automatically alongside the main service in local or CI test pipelines.

## 2. Asynchronous Messaging
- Run integration tests for message-driven boundaries using local containerized message brokers. Assert that the application consumes, processes, and commits messages without errors.

## 3. Contract Verification
- Use API contract tests (e.g., OpenAPI or Pact schemas) to verify that simulator stub behaviors do not drift from the actual production schemas.
