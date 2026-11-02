---
name: tdd
description: Use when implementing, refactoring or fixing behavior through focused regression tests and Red-Green-Refactor.
allowed-tools: Skill Read Edit Bash
---

# Test-Driven Development

Follow the project's test commands, pre-push checks and required CI gates. Name the focused test before changing code. Implement the approved behavior and routine technical choices within scope; return a material contradiction as `replan: <step, evidence, recommendation>`. Do not weaken configured coverage, mutation, risk, security or other gates; changing their thresholds, scope, exemptions or baselines requires owner approval.

## 1. Prove the behavior

For a new behavior or defect, write a focused test through the public interface with real domain objects. Derive expected outcomes from requirements, not the production algorithm. Run it first and confirm it fails for the intended reason; then implement and rerun it. Invoke `ddd` for domain models and `hexagonal-architecture` for ports.

When an existing test already demonstrates the failure, use it as the red evidence. For a test-only, documentation or golden update, run the relevant checks; do not invent a failing test for unchanged behavior. Test risk-bearing outcomes and failure paths, including documented boundaries and data-corrupting mistakes. Run configured reproducible mutation, coverage and risk gates, stricter for changed and critical behavior. When no mutation tool is configured, record mutation-sampling evidence and propose concrete gates. Record revision, commands, toolchain, scope, seed and results; a timeout is incomplete evidence, never a pass.

**Exit gate:** relevant regression failed for the intended reason then passed, or evidence explains why no new behavior test was needed.

## 2. Refactor and verify

Improve structure while preserving behavior. Keep tests observable: avoid private-state access, test-only production APIs, backdoor setters, mere existence assertions or tests of a fake alone. Use injected dependencies and fake clocks where needed. For an adapter, check each implementation against its contract; for a gate, cover allowed and rejected cases and exemption boundaries.

Run the project's specified pre-push checks once on the final changed revision. When the project assigns its full verification or coverage gate to hosted CI, consume that result as the full gate; run it locally only when required or needed to diagnose a failure. A pending hosted check is pending evidence, not a pass. Preserve all configured reproducible confidence evidence; timeouts and skipped checks are not passes. Reuse a valid result for unchanged code instead of rerunning it.

**Exit gate:** focused and required local checks pass; required hosted checks pass for completion, or their pending/failure state and next actor are recorded.

## 3. Report

Return at most 8 lines: changed behavior and paths, `done` with each step's failing test run (command and failure line) captured before its fix, or `stuck: <step, evidence>` when a step's test was never seen failing; a fix written with its test leaves no red run. Then name green evidence or why red does not apply, checks and exits, configured confidence evidence, pending checks or failures, and the next action. Do not redispatch workers or perform orchestration.

**Exit gate:** `done` with a red run per behavior step and evidence for the final revision, or `stuck`/`replan` with the next action.

Read [test-levels.md](references/test-levels.md) when choosing a test level, [mutation-testing.md](references/mutation-testing.md) when auditing a suite, [bug-fixes.md](references/bug-fixes.md) for a regression, and `references/languages/<language>.md` for the relevant supported language.
