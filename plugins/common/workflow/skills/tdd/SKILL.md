---
name: tdd
description: Use when implementing, refactoring or fixing code through Red-Green-Refactor, including reproducing a bug as a failing test first.
allowed-tools: Skill Read Edit Bash
---

# Test-Driven Development (Chicago School)

Execute the Red-Green-Refactor loop in strict linear sequence for each observable behavior slice; committing and shipping belong to `vcs` and the calling flow.

## Project Precedence

Project instructions (`AGENTS.md` or the host's equivalent, project skills, `justfile`) take precedence over this skill and its references for commands, test layout, runners, and coverage policy. Before Phase 1, identify the project's targeted fast test command (e.g. `just quick <target>`) and its completion gate (e.g. `just verify`); use them in every phase.

## Bug Fixes

When the task is a bug, broken test, or regression, the reproduction is the RED test:
1. Reproduce the reported failure as a test, then cut setup and parameters one at a time until only what triggers it remains.
2. Before editing production code, rank up to three falsifiable hypotheses: "If <cause>, then <change> makes the reproduction pass." When the user asked for diagnosis only, report the hypotheses and stop.
3. In GREEN, apply one change per hypothesis, highest-ranked first; revert it when the reproduction still fails.
4. Keep the reproduction in the suite as the regression test.

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
2. Delete production API that only tests call, together with those tests.
3. Re-run the test suite to verify no regressions.
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
- Coverage is a byproduct of behaviour tests. When the gate flags an uncovered line, write the test whose failure a user or caller would notice, or delete the line; a test named after a method's branches, one whose subject is a test double, and one that only walks equality, hash, copy or string-conversion methods prove nothing and stay out of the suite. Prefer language value equality (records, data classes, generated equality) over hand-written equality whose lines would need such tests.
- For a function whose mistake would corrupt data or mislead the user, flip one of its conditions or constants and run its tests: at least one must fail, or add the boundary case that makes it fail.
- To audit a suite or area: pick the target files by risk, then for each file mutate seeded sites in a throwaway checkout, run that file's own tests per mutant, classify and score the results as [mutation-testing.md](references/mutation-testing.md) defines, and report its table. Every survivor gets the test that kills it, or its code is deleted.
- Name a test after the behaviour it protects; a name or comment citing coverage, a branch or a line number marks a test written for the gate.
- End each test on an assertion of the outcome after its last action. A test that acts without asserting, or suppresses the warning that an interaction missed its target, proves only that nothing threw.
- Test a documented range, unit or format at each edge and across its wrap-around (a duration past one hour, a cyclic delta at exactly half the cycle, a multiplier below one).
- Drive time through the project's fake clock or fake async scheduler; a test that waits on real time is slow and flakes under load.
- Prove an adapter contract once and run it against every implementation, including a deliberately broken one the contract must reject.
- A verification gate is code: give each rule one passing and one failing fixture, and match parsed syntax or types rather than one spelling, so an equivalent spelling cannot slip past.
- File each test by what it boots: a test that renders UI belongs with the UI tests even when it checks one value.
- Exclude integration, system, and acceptance tests from coverage calculations; treat them as verification suites, not coverage sources.

---

## Context Pointers

- Read [unit-testing.md](references/unit-testing.md) when writing plain-code unit tests for business behavior and invariants.
- Read [component-testing.md](references/component-testing.md) when writing backend component tests or frontend UI widget specs.
- Read [integration-testing.md](references/integration-testing.md) when testing inter-service communication boundaries.
- Read [system-testing.md](references/system-testing.md) when implementing end-to-end black-box system tests.
- Read [acceptance-testing.md](references/acceptance-testing.md) when introducing new features or acceptance criteria.
- Read [mutation-testing.md](references/mutation-testing.md) when sampling mutants to audit a suite or area.
- Read [java.md](references/languages/java.md) when implementing tests in Java.
- Read [kotlin.md](references/languages/kotlin.md) when implementing tests in Kotlin.
- Read [javascript.md](references/languages/javascript.md) when implementing tests in JavaScript or TypeScript.
- Read [rust.md](references/languages/rust.md) when implementing tests in Rust.
- Read [dart.md](references/languages/dart.md) when implementing tests in Dart or Flutter.
