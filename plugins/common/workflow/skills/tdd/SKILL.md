---
name: tdd
description: Use when implementing, refactoring or fixing code through Red-Green-Refactor, including reproducing a bug as a failing test first.
allowed-tools: Skill Read Edit Bash
---

# Test-Driven Development (Chicago School)

Run Red-Green-Refactor per behaviour slice; the host owns delivery. Project rules override commands, layout and coverage here. First name the targeted test command and the verify gate (the project's `verify` task).

Executing an approved plan, choose routine implementation details autonomously within its acceptance and constraints. On a material contradiction, stop dependent work and return `replan: <step>: <evidence and recommended change>`. Independent technical review settles engineering/ADR changes; only revised product/strategy direction, new paid services, budget increases or protected authority needs owner approval. Do not redispatch workers or invoke workflow orchestration.

## Phases

### 1. RED
Write one behaviour test through the public interface with real domain objects; expected values come from criteria or literals, never the production algorithm. Invoke `ddd` for domain models, `hexagonal-architecture` for ports. Run it alone.

*Exit gate*: it fails on the missing behaviour, deterministically.

### 2. GREEN
Write the minimal passing code; re-run.

*Exit gate*: targeted tests pass. *Output*: `🔴→🟢 <test> · <command> · <failure ≤80 chars> → pass`; if stuck: root cause, failing assertion (≤5 lines), next step.

### 3. REFACTOR
Improve structure; use glossary names; delete production API only tests call, with those tests. Delete, split or consolidate tests when meaningful behavior and confidence remain protected; retain distinct requirements and failure cases, not test count or incidental assertions.

*Exit gate*: tests pass; meaningful behavior and configured confidence gates remain protected.

### 4. VERIFY
Run the verify gate once, at the end; re-running it on unchanged code proves nothing.

*Exit gate*: exit 0 plus required reproducible confidence evidence. Missing evidence blocks completion. *Output*: command, exit code, evidence link and remedy when blocked (≤8 lines).

## Test Design Rules

- **Hard to test is a design defect.** Redesign the production code: extract a type a test drives publicly, inject the dependency through a port, or delete the unreachable line. Do not weaken gates to hide untestable code. Never widen a member for tests, add a backdoor setter or drive private state.
- Use reproducible project coverage, mutation and risk gates, stricter for changed and critical behavior; no universal percentage. Record revision, commands, scope, toolchain, seed and results. Ratchet confidence; weakening thresholds, scope, exclusions or resetting baselines needs explicit owner approval. Missing configured gates or evidence blocks completion; propose concrete gates rather than claiming confidence. A whole measurement timeout is incomplete evidence, never a mutant kill or gate pass. Compare timing only with equivalent environment, scope and warm/cold conditions. No tests merely of a test double or trivial generated behavior.
- Assert behaviour, never private details, pixels or tuning constants. End on an outcome assertion; let missed interactions fail.
- Test each documented range at both edges and its wrap-around. Use the fake clock.
- A gate gets a pass and a fail fixture per rule and a just-outside case per exemption; match parsed syntax.
- File tests by what they boot. Run one adapter contract against every implementation plus a broken one.
- Where a mistake corrupts data, flip a condition or constant: some test must fail.

## Output

Session replies ≤5 lines; run reports ≤8. **Summary:** behavior, changed paths, commands/exits and confidence evidence. **Decision:** recommended replan/owner action or “Nothing needed.”

## Context Pointers

- Read [test-levels.md](references/test-levels.md) when choosing a test level.
- Read [mutation-testing.md](references/mutation-testing.md) when auditing a suite or area.
- Read [bug-fixes.md](references/bug-fixes.md) when the task is a bug, broken test or regression.
- Read `references/languages/<language>.md` (`java`, `kotlin`, `javascript` for JS/TS, `rust`, `dart` for Flutter) when testing in it.
