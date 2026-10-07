# Test Levels

| Level | Boots | Doubles | Rules |
| --- | --- | --- | --- |
| Unit | Nothing: no DI container, runtime, disk, database or network; runs in milliseconds | Real domain objects always (sociable); fake only outbound ports | Group tests by capability, not 1:1 with production files or collaborator topology |
| Component | The app's runtime (routing, serialization, DB mapping, security) or a UI widget | Real local infrastructure via Testcontainers, never an in-memory DB like H2; stub outbound network calls | New metrics, traces or logs are asserted here (local OTel collector or the framework's telemetry test tools) |
| Integration | The service plus local stub servers and containerized brokers, started automatically in local and CI runs | Stubs, never staging or live sandboxes | Assert messages are consumed and committed; contract tests (OpenAPI, Pact) keep stubs aligned with real schemas |
| System | The app exactly as in production, every internal real, production-equivalent config | Only unreachable third parties, at the network boundary | Happy paths and critical failure paths only; edges and invariants belong to unit and component tests |
| Acceptance | The narrowest level the story needs | As that level | Commit the specification (Gherkin, Markdown or executable) before implementation, see it fail, then pass at slice end; business language only, no HTTP, URLs, SQL or tables |
