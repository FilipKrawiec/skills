# Kotlin Tests

- Tools, each the project's configured tool, else the default: runner and assertions Kotest on the JUnit Platform, mutation PIT on JVM, doubles hand-written fakes, Gherkin Cucumber JVM (only for shared Gherkin).
- Write specs in Given/When/Then style: one behaviour per leaf `Then`, one action per `When`.
- Use the framework's own runner where an extension owns the lifecycle, keeping the same Given/When/Then names.
- Gradle source sets per level: `test`, `componentTest`, `integrationTest`, `systemTest` (`src/<set>/kotlin`); tags focus runs inside a set, never replace one.
- Integration store: the project's configured tool, else Testcontainers, with explicit cleanup before and after each spec, or a project listener when sharing is intended.
