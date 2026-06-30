---
name: tdd
description: Use when writing new features or fixing bugs using Test-Driven Development (TDD). Trigger on requests to write tests, fix bugs, implement code logic step-by-step, or run Red-Green-Refactor cycles.
---

# Test-Driven Development (TDD)

Follow these steps to drive feature development through tests using the **Chicago Strategy**.

## Steps

1. **Identify the Next Small Test:** Define the smallest possible behavior to implement.
2. **Write a Failing Test (Red):**
   - Write a unit/integration test that asserts this behavior.
   - **Chicago Strategy:** Use real collaborating objects (aggregates, entities, value objects) instead of mocking them.
   - **Infrastructure Adapters:** Test concrete adapters (e.g., database repositories) using real systems via Testcontainers rather than mocking database clients or queries.
   - Run the test and verify that it fails (Red) for the expected reason.
3. **Make it Pass (Green):**
   - Write the minimum production code necessary to pass the test.
   - Run the test and verify it passes (Green).
4. **Refactor (Clean):**
   - Improve code quality and layout, remove duplication.
   - Ensure the tests remain green.
5. **Repeat:** Continue with the next small test until the vertical slice is complete.

## Context Pointers

- Read `docs/adr/0003-test-driven-development.md` for background context.
