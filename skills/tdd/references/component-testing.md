# Component Testing

## 1. Booted Runtimes
- Boot the application's runtime context (e.g., framework contexts or HTTP server instances) to verify actual routing, serialization, database mappings, and security middleware.

## 2. Local Infrastructure (Testcontainers)
- Always run component tests against real local infrastructure instances (using Testcontainers to orchestrate database containers) rather than using in-memory mock databases (e.g., H2).
- For outbound network boundaries (downstream microservices, external APIs), use mocks or stub servers rather than making live network calls.

## 3. Telemetry Verification
- When a feature introduces new metrics, traces, or log outputs, verify these telemetry signals using a component test.
- Ideally, run a local containerized OpenTelemetry (OTel) collector or use framework-provided telemetry verification tools (e.g., Spring/Micrometer test utilities, mock Otel exporters) in the component test suite to assert that the correct signals, counters, attributes, and span contexts are emitted by the application under test.
