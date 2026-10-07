---
name: tdd
description: Use when implementing, refactoring or fixing code through Red-Green-Refactor, including reproducing a bug as a failing test first.
allowed-tools: Skill Read Edit Bash
---

# Test-Driven Development (Chicago School)

Run Red-Green-Refactor in strict sequence for each observable behaviour slice; committing belongs to `vcs`.

Project instructions (agent rules, project skills, `justfile`) take precedence over this skill for commands, test layout, runners and coverage policy. Before phase 1, identify the project's targeted fast test command (e.g. `just quick <target>`) and its completion gate (e.g. `just verify`).

## Bug Fixes

When the task is a bug, broken test or regression, the reproduction is the RED test:
1. Reproduce the reported failure as a test, then cut setup and parameters one at a time until only what triggers it remains.
2. Before editing production code, rank up to three falsifiable hypotheses: "If <cause>, then <change> makes the reproduction pass." When the user asked for diagnosis only, report the hypotheses and stop.
3. In GREEN, apply one change per hypothesis, highest-ranked first; revert it when the reproduction still fails.
4. Keep the reproduction in the suite as the regression test.

## Phases

### 1. RED
1. Write a focused behaviour test through the public interface, against concrete domain instances. Derive expected values from an independent source (acceptance criteria, worked examples, known literals); a test that recomputes them with the production algorithm passes by construction.
   - When designing domain models or aggregates, invoke `ddd`.
   - When defining application ports or infrastructure adapters, invoke `hexagonal-architecture`.
2. Run the targeted command for this test only.

*Exit gate*: the test fails deterministically on the missing behaviour.

### 2. GREEN
Write the minimal production code that passes the test, and re-run the same command.

*Exit gate*: all targeted tests pass.

*Output envelope (one line per cycle)*: `🔴→🟢 <test name> · <command> · <failure snippet ≤80 chars> → pass`. When GREEN cannot be reached: root cause (1 line), failing assertion (≤5 lines), next step.

### 3. REFACTOR
1. Improve structure without changing behaviour, tighten aggregate invariants, and align names with the project glossary.
2. Delete production API that only tests call, together with those tests.
3. Re-run the targeted tests.

*Exit gate*: all tests pass with no behaviour drift.

### 4. VERIFY
Run the completion gate once, at the task's final boundary; intermediate slices use targeted runs.

*Exit gate*: the gate exits 0. *Output envelope*: `<gate command>: pass`, or the gate's failure excerpt (≤20 lines) plus the remedy.

## Test Design Rules

- Assert behaviour and relations (state, outcomes, ordering, direction, alignment to design tokens); keep expected values independent of private details, layout pixels and tuning constants that change without a behaviour change.
- Apply the project's coverage policy; without one, unit and component tests together reach 100% branch coverage of domain and application layers. Integration, system and acceptance tests are verification suites and stay out of coverage.
- Coverage is a byproduct of behaviour tests. For an uncovered line, write the test whose failure a user or caller would notice, or delete the line. Name each test after the behaviour it protects; a test named after a branch, line or coverage, one whose subject is a test double, and one that only walks equality, hash, copy or string-conversion methods stay out of the suite. Prefer language value equality (records, data classes, generated equality) over hand-written equality.
- Code that is hard to test is a design defect, fixed in production code. When a line is reachable only through a test-only hook (a member widened or annotated for tests, a backdoor setter) or a test that drives private state with invented inputs, redesign: extract the logic into a type whose public interface a test drives, inject the dependency through a port, or delete the line no caller can reach. The coverage threshold and exemption lists stay as they are.
- End each test on an assertion of the outcome after its last action, and let a missed interaction fail rather than silencing its warning.
- Test a documented range, unit or format at each edge and across its wrap-around (a duration past one hour, a cyclic delta at exactly half the cycle, a multiplier below one).
- Drive time through the project's fake clock or fake async scheduler.
- Prove an adapter contract once and run it against every implementation, including a deliberately broken one the contract must reject.
- A verification gate is code: give each rule one passing and one failing fixture, and each exemption one case just outside it that the gate still rejects. Match parsed syntax or types rather than one spelling.
- File each test by what it boots: a test that renders UI belongs with the UI tests even when it checks one value.
- For a function whose mistake would corrupt data or mislead the user, flip one of its conditions or constants and run its tests: at least one must fail, or add the boundary case that makes it fail.
- To audit a suite or area, sample mutants per file as [mutation-testing.md](references/mutation-testing.md) defines and report its table; every survivor gets the test that kills it, or its code is deleted.

## Context Pointers

- Read [unit-testing.md](references/unit-testing.md) when writing plain-code unit tests for business behaviour and invariants.
- Read [component-testing.md](references/component-testing.md) when writing backend component tests or frontend UI widget specs.
- Read [integration-testing.md](references/integration-testing.md) when testing inter-service communication boundaries.
- Read [system-testing.md](references/system-testing.md) when implementing end-to-end black-box system tests.
- Read [acceptance-testing.md](references/acceptance-testing.md) when introducing new features or acceptance criteria.
- Read [mutation-testing.md](references/mutation-testing.md) when sampling mutants to audit a suite or area.
- Read the language profile when writing tests in that language: [java.md](references/languages/java.md), [kotlin.md](references/languages/kotlin.md), [javascript.md](references/languages/javascript.md) (JavaScript or TypeScript), [rust.md](references/languages/rust.md), [dart.md](references/languages/dart.md) (Dart or Flutter).
