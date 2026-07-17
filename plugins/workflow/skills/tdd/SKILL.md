---
name: tdd
description: Use when programming, coding, refactoring, implementing features, or fixing bugs through Red-Green-Refactor with explicit failing and passing test evidence.
---

# Test-Driven Development (TDD)

## Loop

1. **RED**: Write the smallest behavior test and run its focused command; preserve the observed failure.
2. **GREEN**: Make the smallest change that passes it; preserve the passing command and affected files.
3. **REFACTOR**: Improve structure without expanding behavior, then rerun the focused test.
4. **VERIFY**: Run deterministic checks for the changed scope; make failed or skipped checks explicit.

TDD does not prescribe delegation, persistence, commits, or shipping workflow.

## Coverage Rule

- Aggregate unit and component test branch coverage into one value; both suites together must reach 100% branch coverage.
- Exclude integration, system, and acceptance tests from coverage calculations. Treat them as verification suites, not coverage sources.

## Context Pointers

- Read [unit-testing.md](references/unit-testing.md) when writing plain-code unit tests for business behavior and invariants.
- Read [component-testing.md](references/component-testing.md) when writing backend component tests (with booted contexts or database mappings) or frontend UI widget/view specs.
- Read [integration-testing.md](references/integration-testing.md) when testing inter-service communication boundaries.
- Read [system-testing.md](references/system-testing.md) when implementing end-to-end black-box system tests.
- Read [acceptance-testing.md](references/acceptance-testing.md) when the task introduces new features, user stories, or updates to business acceptance criteria.
- Read [java.md](references/languages/java.md) when implementing tests in Java.
- Read [kotlin.md](references/languages/kotlin.md) when implementing tests in Kotlin.
- Read [javascript.md](references/languages/javascript.md) when implementing tests in JavaScript or TypeScript.
- Read [rust.md](references/languages/rust.md) when implementing tests in Rust.
