---
name: tdd
description: Must be used for all programming, coding, refactoring, feature implementation, and bug fixing. Enforces Red-Green-Refactor with committed green states.
user-invocable: false
---

# Test-Driven Development (TDD)

## Steps

1. **Red Stage Checkpoint**: Write the test case(s) describing the behavior. Run the test command to verify the test fails. Do not create or modify any production files before executing the test command and confirming the expected failure. Capture and record this failing test output in the transcript.
2. **Green Stage Checkpoint**: Write the minimal production code necessary to pass the test. Run the test command to verify it passes. Record the passing test output in the transcript.
3. **Commit Green State**: Create a Git commit for this green state (using Conventional Commits format, e.g., type `wip:`, following the `vcs` skill commit guidelines) to lock in the working implementation.
4. **Refactor Stage Checkpoint**: Optimize the design, clean up duplication, improve naming, and enforce clean architectural boundaries. Run the test command to verify that all tests remain green. Record the passing test output in the transcript.
5. **Commit Refactored State**: Create a Git commit for the clean, refactored state (using type `wip:` or a specific type like `refactor:` if it completes the logical change).

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
