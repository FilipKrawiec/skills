# Java Test Guidelines

## Default Stack

- Runner: JUnit Jupiter.
- Assertions: AssertJ.
- Mocks: Mockito, only for outbound ports or slow/external collaborators.
- Acceptance: Cucumber JVM when feature files add value; otherwise JUnit acceptance classes.

## Scenario Shape

- Prefer `Given...` nested classes (`@Nested`) or `@DisplayName` groups for scenario context.
- Name test methods as behavior: `whenSubmittingThread_thenItIsSaved`.
- Keep `Given / When / Then` comments only where they clarify a non-trivial setup, action, or assertion.
- Assert observable outcomes first; verify interactions only at architectural boundaries.

## Component And Acceptance Tests

- Use designated Gradle source sets for suite boundaries:
  - `src/test/java` via `test` for fast unit tests.
  - `src/componentTest/java` via `componentTest` for booted in-process components and database mappings.
  - `src/integrationTest/java` via `integrationTest` for external adapters, messaging, or real infrastructure.
  - `src/systemTest/java` via `systemTest` for black-box deployed-service checks.
- Use Testcontainers through the JUnit Jupiter extension for real infrastructure mappings.
- Keep acceptance scenarios in the narrowest source set that owns the behavior; add `acceptanceTest` only when product-level Gherkin has a separate lifecycle.
- Keep Cucumber step definitions thin: translate Gherkin to application/API calls, with assertions near the scenario boundary.
