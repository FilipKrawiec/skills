# Kotlin Tests

- Stack: Kotest on the JUnit Platform with Kotest matchers, PIT for mutation on JVM, MockK for outbound ports (Mokkery or Mockative on Multiplatform), fakes for simple in-memory collaborators, Cucumber JVM only for shared Gherkin.
- All domain and unit specs use Kotest, preferably `BehaviorSpec`; one behaviour per leaf `Then`, one action per `When`.
- Use JUnit Jupiter only where a framework extension owns the lifecycle (`@QuarkusTest`), keeping the same Given/When/Then names.
- Gradle source sets per level: `test`, `componentTest`, `integrationTest`, `systemTest` (`src/<set>/kotlin`); Kotest tags focus runs inside a set, never replace one.
- Testcontainers need explicit `beforeSpec`/`afterSpec` cleanup, or a project listener when sharing is intended.
