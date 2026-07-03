# Component Testing

## 1. Booted Runtimes
- Boot the application's runtime context (e.g., framework contexts or HTTP server instances) to verify actual routing, serialization, database mappings, and security middleware.

## 2. Local Infrastructure (Testcontainers)
- Always run component tests against real local infrastructure instances (using Testcontainers to orchestrate database containers) rather than using in-memory mock databases (e.g., H2).
- For outbound network boundaries (downstream microservices, external APIs), use mocks or stub servers rather than making live network calls.
