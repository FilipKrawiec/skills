# API Layer (Inbound/Ingress Adapters)

Guidelines for implementing inbound adapters that drive the application.

## 1. Entry Points
- The API Layer contains all entry points to the application (e.g., HTTP/REST controllers, gRPC handlers, Kafka/RabbitMQ event consumers, CLI commands).

## 2. Inbound Adapter Duties
- Handles transport-level protocols and concerns (e.g., HTTP status codes, routing, serialization/deserialization, rate limiting, and transport-level validation).
- Performs structural validation of payloads (e.g., checking for required fields, JSON formats) before passing them inward.

## 3. Payload Mapping and Invocation
- Maps incoming request payloads directly to Application **Commands** or **Queries**.
- Executes use-cases by **directly injecting and invoking** the specific Use Case / Handler interface (avoiding mediator/bus abstractions to keep dependencies explicit and easy to navigate).
- Contains **zero business or domain logic**.
