# Java Testing Library & Pattern Guidelines

## Core Stack
- **Executor:** JUnit 5 (`org.junit.jupiter`)
- **Mocker:** Mockito (`org.mockito`)
- **Acceptance (BDD Tools):** Cucumber JVM (`io.cucumber`)
- **Assertions:** AssertJ (`org.assertj.core.api.Assertions`)

## 1. Unit Testing
- Structure unit tests natively using BDD structure (nested classes and Given-When-Then comments, validating results via AssertJ):
  ```java
  import org.junit.jupiter.api.Nested;
  import org.junit.jupiter.api.Test;
  import static org.mockito.Mockito.mock;
  import static org.mockito.Mockito.verify;
  import static org.mockito.Mockito.any;
  import static org.assertj.core.api.Assertions.assertThat;

  class ThreadSubmissionTest {
      @Nested
      class GivenAnEmptyThreadStore {
          @Test
          void shouldSaveSubmittedThread() {
              // Given: Threads is an outbound boundary port interface, permitting mocking under Chicago School rules.
              Threads threads = mock(Threads.class);
              SubmitThreadUseCase useCase = new SubmitThreadUseCase(threads);

              // When
              SubmissionResult result = useCase.execute(new SubmitThreadCommand("Title"));

              // Then
              verify(threads).save(any(ForumThread.class));
              assertThat(result.isSuccess()).isTrue(); // Validate outcome using AssertJ
          }
      }
  }
  ```

## 2. Component Testing
- Programmatic port binding and Testcontainers database wiring using JUnit 5 automatic container management:
  ```java
  import org.junit.jupiter.api.Test;
  import org.junit.jupiter.api.AfterAll;
  import org.junit.jupiter.api.BeforeAll;
  import org.testcontainers.containers.PostgreSQLContainer;
  import org.testcontainers.junit.jupiter.Container;
  import org.testcontainers.junit.jupiter.Testcontainers;
  import java.net.http.HttpClient;
  import java.net.http.HttpRequest;
  import java.net.http.HttpResponse;
  import java.net.URI;
  import static org.assertj.core.api.Assertions.assertThat;

  @Testcontainers
  class ComponentTest {
      @Container
      static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
      
      static AppServer server;

      @BeforeAll
      static void setup() {
          server = new AppServer(0, postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
          server.start();
      }

      @AfterAll
      static void teardown() {
          if (server != null) {
              server.stop();
          }
      }

      @Test
      void shouldCreateThread() throws Exception {
          HttpClient client = HttpClient.newHttpClient();
          HttpRequest request = HttpRequest.newBuilder()
              .uri(URI.create("http://localhost:" + server.port() + "/threads"))
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString("{\"title\":\"Java Component\"}"))
              .build();
          HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
          assertThat(response.statusCode()).isEqualTo(200);
      }
  }
  ```

## 3. Acceptance Testing
- **Grouping & Task Execution:** Filter tests using class naming patterns (e.g. `*AcceptanceTest.java`) or separate Gradle `sourceSets` (e.g. `src/acceptanceTest`) in `build.gradle`:
  - **Alternative A (Single sourceSet, class filtering):**
    - `./gradlew test` (Runs developer unit & component tests)
    - `./gradlew test --tests "*AcceptanceTest"` (Runs only acceptance tests matching class name pattern)
  - **Alternative B (Dedicated sourceSet, execution task):**
    - `./gradlew acceptanceTest` (Runs Cucumber regression feature specs via dedicated task)
- **Step Definition Example:**
  ```java
  import io.cucumber.java.en.When;

  public class StepDefinitions {
      @When("a user submits a thread titled {string}")
      public void userSubmitsThread(String title) {
          // Step definition executing against API, HTTP client or memory context
      }
  }
  ```
