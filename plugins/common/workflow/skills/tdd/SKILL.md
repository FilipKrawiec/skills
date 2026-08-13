---
name: tdd
description: Use when programming, coding, refactoring, implementing features, or fixing bugs through Red-Green-Refactor with explicit failing and passing test evidence.
---

# Test-Driven Development (Chicago School)

Execute the Red-Green-Refactor loop in strict linear sequence for each observable behavior slice. TDD does not prescribe delegation, persistence, commits, or shipping workflow.

## Execution Phases

### Phase 1: **RED** (Failing Test)
1. Write a focused behavior test exercising the public interface through an externally observable seam against concrete domain instances. Derive expected values from an independent source of truth (acceptance criteria, worked examples, or known literals); a test that recomputes expected results with the production algorithm is tautological and passes by construction.
   - When designing domain models or aggregates, invoke `ddd`.
   - When defining application ports or infrastructure adapters, invoke `hexagonal-architecture`.
2. Execute the test command in the terminal.
*Exit Gate*: Test fails deterministically on the missing feature.
*Output Envelope*:
```text
🔴 RED Command: `<test-command>`
🔴 Observed Failure: `<error-snippet>`
```

### Phase 2: **GREEN** (Minimal Implementation)
1. Write the minimal production code to satisfy the test.
2. Re-run the test command.
*Exit Gate*: All tests pass with exit code 0.
*Output Envelope*:
```text
🟢 GREEN Command: `<test-command>`
🟢 Test Result: `<pass-summary-exit-0>`
```

### Phase 3: **REFACTOR** (Clean Code & Invariants)
1. Improve structure without expanding behavior, tighten aggregate invariants, and align variable names with the project glossary.
2. Re-run the test suite to verify no regressions.
*Exit Gate*: Code is clean; all tests pass without behavior drift.

### Phase 4: **VERIFY** (Deterministic Gate)
1. Run repository verification: execute the project's configured verification command (e.g. `just verify` or test runner).
*Exit Gate*: Project verification passes with exit code 0.

---

## Test Design & Coverage Rules

- Test behavior through public observable seams; keep tests independent of private implementation details.
- Aggregate unit and component test branch coverage into one value; both suites together must reach 100% branch coverage for domain and application layers.
- Exclude integration, system, and acceptance tests from coverage calculations; treat them as verification suites, not coverage sources.

---

## Context Pointers

- Read [unit-testing.md](references/unit-testing.md) when writing plain-code unit tests for business behavior and invariants.
- Read [component-testing.md](references/component-testing.md) when writing backend component tests or frontend UI widget specs.
- Read [integration-testing.md](references/integration-testing.md) when testing inter-service communication boundaries.
- Read [system-testing.md](references/system-testing.md) when implementing end-to-end black-box system tests.
- Read [acceptance-testing.md](references/acceptance-testing.md) when introducing new features or acceptance criteria.
- Read [java.md](references/languages/java.md) when implementing tests in Java.
- Read [kotlin.md](references/languages/kotlin.md) when implementing tests in Kotlin.
- Read [javascript.md](references/languages/javascript.md) when implementing tests in JavaScript or TypeScript.
- Read [rust.md](references/languages/rust.md) when implementing tests in Rust.
