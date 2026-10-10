---
name: tdd
description: Use when implementing, refactoring or fixing code through Red-Green-Refactor, including reproducing a bug as a failing test first.
allowed-tools: Skill Read Edit Bash
---

# Test-Driven Development (Chicago School)

Run Red-Green-Refactor per behaviour slice; `vcs` commits. Project rules override commands, layout and coverage here. First name the targeted test command and the verify gate (the project's `verify` task).

## Phases

### 1. RED
Write one behaviour test through the public interface with real domain objects; expected values come from criteria or literals, never the production algorithm. Invoke `ddd` for domain models, `hexagonal-architecture` for ports. Run it alone.

*Exit gate*: it fails on the missing behaviour, deterministically.

### 2. GREEN
Write the minimal passing code; re-run.

*Exit gate*: targeted tests pass. *Output*: `🔴→🟢 <test> · <command> · <failure ≤80 chars> → pass`; if stuck: root cause, failing assertion (≤5 lines), next step.

### 3. REFACTOR
Improve structure; use glossary names; delete production API only tests call, with those tests.

*Exit gate*: all tests pass.

### 4. VERIFY
Run the verify gate once, at the end; re-running it on unchanged code proves nothing.

*Exit gate*: exit 0. *Output*: `<gate>: pass`, or its excerpt (≤20 lines) and the remedy.

## Test Design Rules

- **Hard to test is a design defect.** Redesign the production code: extract a type a test drives publicly, inject the dependency through a port, or delete the unreachable line. Never lower the coverage threshold, add an exemption, widen a member for tests, add a backdoor setter or drive private state.
- Default coverage: 100% branch of domain and application, from unit and component tests only. Cover a line with a test a caller would notice failing, or delete it. No tests named after coverage, of a test double, or of hand-written equality, hash, copy or toString.
- Assert behaviour, never private details, pixels or tuning constants. End on an outcome assertion; let missed interactions fail.
- Test each documented range at both edges and its wrap-around. Use the fake clock.
- A gate gets a pass and a fail fixture per rule and a just-outside case per exemption; match parsed syntax.
- File tests by what they boot. Run one adapter contract against every implementation plus a broken one.
- Where a mistake corrupts data, flip a condition or constant: some test must fail.

## Context Pointers

- Read [test-levels.md](references/test-levels.md) when choosing a test level.
- Read [mutation-testing.md](references/mutation-testing.md) when auditing a suite or area.
- Read [bug-fixes.md](references/bug-fixes.md) when the task is a bug, broken test or regression.
- Read `references/languages/<language>.md` (`java`, `kotlin`, `javascript` for JS/TS, `rust`, `dart` for Flutter) when testing in it.
