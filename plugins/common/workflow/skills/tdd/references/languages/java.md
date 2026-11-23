# Java Tests

- Tools, each the project's configured tool, else the default: runner JUnit Jupiter, assertions AssertJ, mutation PIT, doubles hand-written fakes, Gherkin Cucumber JVM (only when feature files add value).
- Group scenarios with `@Nested` or `@DisplayName`; name methods as behaviour (`whenSubmittingThread_thenItIsSaved`).
- Gradle source sets per level: `test`, `componentTest`, `integrationTest`, `systemTest` (`src/<set>/java`); add `acceptanceTest` only when Gherkin has its own lifecycle.
- Integration store: the project's configured tool, else Testcontainers through its JUnit Jupiter extension.
- Cucumber step definitions only translate Gherkin into application or API calls.
