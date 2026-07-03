# System Testing

## 1. Zero Mocking of Application Internals
- Boot the application exactly as in production. Do not mock any dependency-injected components, domain logic, or internal services.
- Configure system tests using production-equivalent settings (active security, database containers, queue listeners).
- If external third-party systems cannot be reached, mock them at the network/HTTP boundary rather than modifying application code.

## 2. Lean Coverage
- Limit system tests to the primary happy paths and critical integration failure paths of each vertical slice. Test all boundary conditions, input validation, and business invariants using unit and component tests.
