# Unit Testing

## 1. Speed and Isolation
- **No Framework Bootstrapping:** Unit tests must be written in a plain programming language and run without booting dependency injection containers, web runtimes, or loading external server/test contexts.
- **Sub-Second Execution:** The entire test suite must execute in milliseconds. Do not perform disk access, database operations, or network calls.

## 2. Structural Independence
- Organize tests around business capabilities and aggregates rather than coupling them 1:1 to production code components or directory layouts. Test structures can differ completely from production layouts.
- Exercise behavior through a public interface or other externally observable seam; keep tests independent of private methods and collaborator topology.
- Derive expected values from an independent source of truth such as an acceptance criterion, a worked example, or a known-good literal. A test that recomputes the expected result with the production algorithm is tautological and passes by construction.

## 3. Chicago Strategy (Mandatory)
- Use real collaborating objects, structs, entities, value objects, and domain components in test setups (sociable testing). Mocking domain models is strictly forbidden.
- Mocking is permitted only for outbound port interfaces at the boundary of the application/domain layer (e.g., database repositories, third-party API clients).
