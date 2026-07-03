# Kotlin Testing Library & Pattern Guidelines

## Core Stack
- **Executor:** Kotest (running on JUnit 5 platform engine)
- **Mocker:** MockK (Mokkery or Mockative for Kotlin Multiplatform / KMP)
- **Acceptance (BDD Tools):** Cucumber JVM (`io.cucumber`)
- **Assertions:** Kotest Assertions

## 1. Unit Testing
- Structure unit tests natively using Kotest BDD style (`BehaviorSpec`):
  ```kotlin
  import io.kotest.core.spec.style.BehaviorSpec
  import io.mockk.mockk
  import io.mockk.verify
  import io.mockk.any
  import io.mockk.every

  class ThreadSubmissionSpec : BehaviorSpec({
      Given("an empty thread store") {
          // Given: Threads is an outbound boundary port interface, permitting mocking under Chicago School rules.
          val threads = mockk<Threads>()
          every { threads.save(any()) } returns Unit
          val useCase = SubmitThreadUseCase(threads)

          When("a user submits a thread") {
              useCase.execute(SubmitThreadCommand("Kotlin Title"))

              Then("it is saved to the store") {
                  verify { threads.save(any()) }
              }
          }
      }
  })
  ```

## 2. Component Testing
- Programmatic port binding and Testcontainers lifecycle setup in Kotest:
  ```kotlin
  import io.kotest.core.spec.style.FunSpec
  import io.kotest.matchers.shouldBe
  import org.testcontainers.containers.PostgreSQLContainer
  import java.net.http.HttpClient
  import java.net.http.HttpRequest
  import java.net.http.HttpResponse
  import java.net.URI

  class ComponentSpec : FunSpec({
      var server: AppServer? = null

      beforeSpec {
          postgres.start()
          server = AppServer(
              port = 0, 
              dbUrl = postgres.jdbcUrl,
              dbUsername = postgres.username,
              dbPassword = postgres.password
          ).apply { start() }
      }

      afterSpec {
          if (server != null) {
              server.stop()
          }
          postgres.stop() // Guarantees container is stopped after the spec finishes
      }

      test("should create thread successfully") {
          val client = HttpClient.newHttpClient()
          val request = HttpRequest.newBuilder()
              .uri(URI.create("http://localhost:${server!!.port}/threads"))
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString("{\"title\":\"Kotlin Component\"}"))
              .build()
          val response = client.send(request, HttpResponse.BodyHandlers.ofString())
          response.statusCode() shouldBe 200
      }
  }) {
      companion object {
          // Initialize lazily to prevent Kotest class-scanning side-effects
          val postgres by lazy { PostgreSQLContainer<Nothing>("postgres:16-alpine") }
      }
  }
  ```

## 3. Acceptance Testing
- **Grouping & Task Execution:** Filter tests using class naming patterns (e.g. `*AcceptanceTest.kt`), Kotest tags (`NamedTag("acceptance")`), or separate Gradle `sourceSets` in `build.gradle.kts`:
  - **Alternative A (Single sourceSet, class/tag filtering):**
    - `./gradlew test` (Runs developer unit & component tests)
    - `./gradlew test --tests "*AcceptanceTest"` (Runs only acceptance tests matching class name pattern)
    - `./gradlew test -Dkotest.tags=acceptance` (Kotest-specific tag filtering)
  - **Alternative B (Dedicated sourceSet, execution task):**
    - `./gradlew acceptanceTest` (Runs Cucumber regression feature specs via dedicated task)
- **Step Definition Example:**
  ```kotlin
  import io.cucumber.java.en.When

  class StepDefinitions {
      @When("a user submits a thread titled {string}")
      fun userSubmitsThread(title: String) {
          // Step definition executing against API, HTTP client or memory context
      }
  }
  ```
