# Kotlin Test Guidelines

## Default Stack

- Unit runner/style: Kotest on the JUnit Platform.
- Component-or-higher fallback: JUnit Jupiter when a framework extension owns the test lifecycle.
- Assertions: Kotest matchers.
- Mocks: MockK on JVM; use Mokkery or Mockative for Kotlin Multiplatform.
- Acceptance: Cucumber JVM only when shared Gherkin scenarios are useful.

## Scenario Shape

- Use Kotest for all domain and unit specs.
- Prefer `BehaviorSpec` for TDD examples because it exposes `Given / When / Then` directly.
- Allow JUnit Jupiter only for component, integration, system, or acceptance tests where framework-managed runners do not support Kotest, such as Quarkus tests using `@QuarkusTest`.
- Keep one behavior per leaf `Then`; do not bury multiple actions in one `When`.
- Use MockK for outbound ports; prefer fakes for simple in-memory domain collaborators.
- Keep the same Given/When/Then structure and behavior names when falling back to JUnit.

## Component And Acceptance Tests

- Use designated Gradle source sets for suite boundaries:
  - `src/test/kotlin` via `test` for fast unit specs.
  - `src/componentTest/kotlin` via `componentTest` for booted in-process components and database mappings.
  - `src/integrationTest/kotlin` via `integrationTest` for external adapters, messaging, or real infrastructure.
  - `src/systemTest/kotlin` via `systemTest` for black-box deployed-service checks.
- Keep `src/test/kotlin` domain/unit specs on Kotest. Prefer JUnit Jupiter in `componentTest`, `integrationTest`, `systemTest`, or acceptance source sets that depend on framework test extensions.
- Use Testcontainers with explicit `beforeSpec`/`afterSpec` lifecycle cleanup, or project-level listeners when shared containers are intentional.
- Use Kotest tags inside a source set for focused execution, not as the primary substitute for source-set ownership.
- Keep Cucumber step definitions as adapters over APIs or application services, not places for business logic.
