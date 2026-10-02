# Unit Testing

## 1. Speed and Isolation
- **Plain Language Only:** Unit tests run as plain code, with dependency injection containers, web runtimes and external server or test contexts left unbooted.
- **Sub-Second Execution:** The entire suite runs in milliseconds, in memory: disk, database and network stay untouched.

## 2. Structural Independence
- Organize tests around business capabilities and aggregates rather than coupling them 1:1 to production code components or directory layouts. Test structures can differ completely from production layouts.
- Exercise behavior through a public interface or other externally observable seam; keep tests independent of private methods and collaborator topology.
- Derive expected values from an independent source of truth, as SKILL.md's RED phase requires.

## 3. Chicago Strategy (Mandatory)
- Use real collaborating objects, structs, entities, value objects, and domain components in test setups (sociable testing); domain models always appear as themselves.
- Mocking is permitted only for outbound port interfaces at the boundary of the application/domain layer (e.g., database repositories, third-party API clients).
