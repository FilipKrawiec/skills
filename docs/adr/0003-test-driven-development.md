# ADR-0003: Adopt Test-Driven Development (TDD) for Agent Workflows

## Decision

We will adopt Test-Driven Development (TDD) as the standard engineering process for all feature implementation and bug fixing.

The process is governed by the following rules:

1. **Vertical Slices:**
   - Features must be broken down into the smallest possible testable vertical slices of functionality.
   
2. **Red-Green-Refactor Loop:**
   - **Red:** Always write a failing test first before writing any production code.
   - **Green:** Implement only the minimal amount of code required to make the test pass.
   - **Refactor:** Clean up, improve design, and optimize both tests and production code while maintaining green test runs.

3. **Chicago Strategy (Classicist TDD):**
   - Agresively avoid mock objects. Test using real collaborators and verify state/behavior instead of interaction.
   - Test infrastructure adapters (e.g. database repositories) using real systems via Testcontainers where possible, rather than mocking database connections or queries.
   - Real instances of aggregates, entities, and value objects must be used in tests.

## Context

Agents struggle with large, monolithic implementations that are hard to debug and verify. Without TDD, they often write untested code or create overly mock-heavy unit tests that mock the entire universe, failing to verify actual integration and logic invariants.

## Consequences

- Agents must write test code before implementation code.
- Mocks are reduced, leading to more robust and less brittle test suites.
- We must provide a concrete skill (`tdd`) to guide agents in this process.
