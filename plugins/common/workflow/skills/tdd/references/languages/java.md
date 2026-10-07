# Java Tests

- Stack: JUnit Jupiter, AssertJ, PIT for mutation, Mockito only for outbound ports, Cucumber JVM only when feature files add value.
- Group scenarios with `@Nested` or `@DisplayName`; name methods as behaviour (`whenSubmittingThread_thenItIsSaved`).
- Gradle source sets per level: `test`, `componentTest`, `integrationTest`, `systemTest` (`src/<set>/java`); add `acceptanceTest` only when Gherkin has its own lifecycle.
- Use Testcontainers through its JUnit Jupiter extension.
- Cucumber step definitions only translate Gherkin into application or API calls.
