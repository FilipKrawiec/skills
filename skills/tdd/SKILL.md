---
name: tdd
description: Use when programming, coding, refactoring, implementing features, or fixing bugs through Red-Green-Refactor with explicit failing and passing test evidence.
---

# Test-Driven Development (TDD)

## TDD Execution & Delegation Model

To prevent log pollution and context bloating at the root level, TDD execution is divided into two distinct roles:

### 1. Root Coordinator Role
- **Orchestrate**: The root agent coordinates the stages of the task run. It does NOT modify code, write tests, or execute gradle/test commands directly.
- **Progress Tracking**: Root spawns specialized subagents for each checkpoint (Red, Green, Refactor) and receives only high-level status outputs (files changed, success/failure, brief summary).

### 2. Subagent TDD Steps (Executed inside isolated Subagent sandboxes)

- **Red Stage Checkpoint (Test Subagent)**:
  1. Write or update test cases describing the expected behavior.
  2. Run the specific test command inside the sandbox to verify tests compile and fail (Red State).
  3. Commit and push the Red state.
  4. Return only the pass/fail outcome to the root agent (preventing raw logs from reaching root).

- **Green Stage Checkpoint (Implementor Subagent)**:
  1. Write the minimal production code necessary to satisfy the test cases.
  2. Run the test command in the sandbox to verify the tests now pass (Green State).
  3. Commit the Green state.
  4. Return only the success status and file summary to the root agent.

- **Refactor Stage Checkpoint (Refactoring Subagent)**:
  1. Optimize code design, clean up duplication, and enforce clean architectural boundaries.
  2. Run the test command in the sandbox to verify tests remain green.
  3. Commit the Refactored state.
  4. Return the final success status and patch details to the root agent.

- **Black-Box Harness Verification**:
  - The Harness runs the completed patch through black-box sensors (compilation, full test suite check).
  - If a sensor fails, the Harness delegates the fix to a specialized Tester Subagent to troubleshoot and fix it, keeping the root context clean.

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
