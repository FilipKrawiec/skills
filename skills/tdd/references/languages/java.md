# Java Test Guidelines

## Default Stack

- Runner: JUnit Jupiter.
- Assertions: AssertJ.
- Mocks: Mockito, only for outbound ports or slow/external collaborators.
- Acceptance: Cucumber JVM when feature files add value; otherwise JUnit acceptance classes.

## Scenario Shape

- Prefer `Given...` nested classes or `@DisplayName` groups for scenario context.
- Name test methods as behavior: `whenSubmittingThread_thenItIsSaved`.
- Keep `Given / When / Then` comments only where they clarify a non-trivial setup, action, or assertion.
- Assert observable outcomes first; verify interactions only at architectural boundaries.

```java
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SubmitThreadTest {
    @Nested
    class GivenAnEmptyThreadStore {
        @Test
        void whenSubmittingThread_thenItIsSaved() {
            // Given
            Threads threads = mock(Threads.class);
            SubmitThreadUseCase useCase = new SubmitThreadUseCase(threads);

            // When
            SubmissionResult result = useCase.execute(new SubmitThreadCommand("Java Title"));

            // Then
            assertThat(result.isSuccess()).isTrue();
            verify(threads).save(any(ForumThread.class));
        }
    }
}
```

## Component And Acceptance Tests

- Use designated Gradle source sets for suite boundaries:
  - `src/test/java` via `test` for fast unit tests.
  - `src/componentTest/java` via `componentTest` for booted in-process components and database mappings.
  - `src/integrationTest/java` via `integrationTest` for external adapters, messaging, or real infrastructure.
  - `src/systemTest/java` via `systemTest` for black-box deployed-service checks.
- Use Testcontainers through the JUnit Jupiter extension for real infrastructure mappings.
- Keep acceptance scenarios in the narrowest source set that owns the behavior; add `acceptanceTest` only when product-level Gherkin has a separate lifecycle.
- Keep Cucumber step definitions thin: translate Gherkin to application/API calls, with assertions near the scenario boundary.
