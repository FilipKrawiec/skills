---
name: tdd
description: Use when writing new features or fixing bugs using Test-Driven Development (TDD). Trigger on requests to write tests, fix bugs, implement code logic step-by-step, or run Red-Green-Refactor cycles.
---

# Test-Driven Development (TDD)

Follow these steps to drive feature development through tests to achieve high confidence and coverage.

## Steps

1. **Identify the Next Small Test:** Define the smallest possible behavior to implement.
2. **Write a Failing Test (Red):**
   - Write a unit or integration test that asserts this behavior.
   - Run the test and verify that it fails (Red) for the expected reason.
3. **Make it Pass (Green):**
   - Write the minimum production code necessary to pass the test.
   - Run the test and verify it passes (Green).
4. **Refactor (Clean):**
   - Clean up, improve design, and optimize both tests and production code.
   - Run tests to verify they remain green.
5. **Repeat:** Continue with the next small test until the vertical slice is complete, aiming for 100% branch coverage on domain logic and application usecases.

## Context Pointers

- Read [0003-test-driven-development.md](file:///Users/filip/Developer/projects/github.com/FilipKrawiec/skills/docs/adr/0003-test-driven-development.md) for detailed rules on TDD, the Chicago Strategy (classicist TDD), and avoiding mock objects.
