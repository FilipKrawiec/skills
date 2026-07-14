---
name: tdd
description: Use when programming, coding, refactoring, implementing features, or fixing bugs through Red-Green-Refactor with explicit failing and passing test evidence.
---

# Test-Driven Development (TDD)

## One-Agent Loop

One agent owns the complete Red-Green-Refactor loop in the active SDLC EXECUTE Phase. Do not delegate checkpoints, create intermediate commits, or push from TDD.

1. **RED**: Write or update the smallest behavior test and run its focused command. Record the failing command and observed failure as Lifecycle evidence.
2. **GREEN**: Make the smallest production change that passes the focused test. Record the passing command and affected files.
3. **REFACTOR**: Improve structure without expanding behavior, then rerun the focused test. Preserve the green result.
4. **VERIFY**: Run the selected deterministic sensors for the changed scope. Failed or skipped checks remain explicit evidence and risk.

VCS commits belong to SHIP, not to an intermediate TDD checkpoint. Attach RED, GREEN, REFACTOR, and verification evidence to the active Lifecycle through the authoritative State Store.

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
