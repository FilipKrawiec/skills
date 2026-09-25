---
name: tdd
description: Use when programming, coding, refactoring, implementing features, or fixing bugs through Red-Green-Refactor with explicit failing and passing test evidence.
allowed-tools: Skill Read Edit Bash
---

# Test-Driven Development (Chicago School)

Execute the Red-Green-Refactor loop in strict linear sequence for each observable behavior slice. TDD does not prescribe delegation, persistence, commits, or shipping workflow.

## Project Precedence

Project instructions (`AGENTS.md`, `CLAUDE.md`, project skills, `justfile`) take precedence over this skill and its references for commands, test layout, runners, and coverage policy. Before Phase 1, identify the project's targeted fast test command (e.g. `just quick <target>`) and its completion gate (e.g. `just verify`); use them in every phase.

## Execution Phases

### Phase 1: **RED** (Failing Test)
1. Write a focused behavior test exercising the public interface through an externally observable seam against concrete domain instances. Derive expected values from an independent source of truth (acceptance criteria, worked examples, or known literals); a test that recomputes expected results with the production algorithm is tautological and passes by construction.
   - When designing domain models or aggregates, invoke `ddd`.
   - When defining application ports or infrastructure adapters, invoke `hexagonal-architecture`.
2. Execute the project's targeted fast test command for this test only.
*Exit Gate*: Test fails deterministically on the missing feature.

### Phase 2: **GREEN** (Minimal Implementation)
1. Write the minimal production code to satisfy the test.
2. Re-run the same targeted command.
*Exit Gate*: All tests pass with exit code 0.

*Output Envelope (per RED→GREEN cycle, one line)*:
```text
🔴→🟢 <test name> · `<command>` · <failure snippet ≤80 chars> → pass
```
Report longer failure detail only when GREEN cannot be reached, as: root cause (1 line), failing assertion (≤5 lines), next step.

### Phase 3: **REFACTOR** (Clean Code & Invariants)
1. Improve structure without expanding behavior, tighten aggregate invariants, and align variable names with the project glossary.
2. Re-run the test suite to verify no regressions.
*Exit Gate*: Code is clean; all tests pass without behavior drift.

### Phase 4: **VERIFY** (Targeted & Completion Gate)
1. Run the targeted test suite or module verification for the changed slice to confirm clean execution.
2. Run the project's completion gate (`just verify` or `scripts/project-verify.py`) once at the final task-completion boundary; intermediate slices use targeted runs only.
*Exit Gate*: Targeted test suite and final project verification pass with exit code 0.
*Output Envelope*: one line — `<gate command>: pass` — or, on failure, the gate's failure excerpt (≤20 lines) plus the remedy.

---

## Test Design & Coverage Rules

- Test behavior through public observable seams; keep tests independent of private implementation details.
- Assert behavior and relations (state, outcomes, ordering, direction, alignment to design tokens); keep expected values independent of layout pixels and tuning constants that change without a behavior change.
- Apply the project's coverage policy. When the project defines none, aggregate unit and component test branch coverage into one value reaching 100% branch coverage for domain and application layers.
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
- Read [dart.md](references/languages/dart.md) when implementing tests in Dart or Flutter.
