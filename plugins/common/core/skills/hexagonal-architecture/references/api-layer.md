# API Layer (Inbound Adapters)

- Own transport concerns: routing, status codes, (de)serialization, rate limits and structural payload validation.
- Map each request to an application command or query and call the use case injected directly; no mediator or bus.
- Never call domain repositories, query ports or DAOs, even for a one-line read.
- Hold no business logic; own the request and response DTOs, and never expose domain types as DTOs.
