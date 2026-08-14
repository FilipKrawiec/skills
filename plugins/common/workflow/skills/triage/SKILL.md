---
name: triage
description: Use when diagnosing, troubleshooting, reproducing, or fixing a bug, broken test, error log, regression, or unexpected runtime behavior.
allowed-tools: Read Edit Bash
---

# Scientific Triage & Root-Cause Debugging

Execute these five affirmative phases in strict linear sequence to isolate and resolve defects with deterministic verification.

## Diagnostic Loop

### Phase 1: Capture Failing Signal
1. Write a standalone reproduction test or minimal executable CLI script exercising the reported defect.
2. Execute the reproduction command in the terminal.
3. Record the failing output.
*Exit Gate*: Terminal output displays a deterministic failure status (RED).
*Output Envelope*:
```text
🔴 Repro Command: `<exact-command>`
🔴 Failure Output: `<exact-error-snippet>`
```

### Phase 2: Minimize Reproduction
1. Remove parameters, setup lines, and mocks one at a time from the reproduction script.
2. Re-run the reproduction command after each cut.
*Exit Gate*: Reproduction contains only the minimal code required to trigger the failure.

### Phase 3: Rank Falsifiable Hypotheses
1. Inspect the minimized reproduction against codebase execution paths.
2. Formulate three ranked falsifiable hypotheses:
   ```text
   Hypothesis 1: If [Root Cause X] is true, then [Code Modification Y] will produce [Observable Result Z].
   Hypothesis 2: ...
   Hypothesis 3: ...
   ```
3. When the user requests diagnosis or investigation only, emit the root cause analysis and ranked hypotheses and stop here without modifying code.
*Exit Gate*: Three falsifiable predictions ranked by probability.

### Phase 4: Targeted Fix & Verification
1. Apply the single code change addressing the highest-ranked un-falsified hypothesis.
2. Re-run the reproduction command. If the reproduction continues to fail or causes regressions, revert the change and test the next ranked hypothesis in sequence.
3. Record the passing output (GREEN) once the defect is resolved.
4. Run repository verification: execute the project's configured verification command (e.g. `just verify` or test runner).
*Exit Gate*: Reproduction test and project verification both exit with code 0.
*Output Envelope*:
```text
🟢 Fix Applied: [symbol_or_function](file:///path/to/file#L10-L20)
🟢 Verification Output: `<test-summary-and-exit-0>`
```

### Phase 5: Regression Lock
1. Move the reproduction test into the permanent repository test suite (`tests/`).
2. Run full test suite: execute the project test runner (e.g. `pytest`, `npm test`, `cargo test`, or `just test`).
*Exit Gate*: Regression test runs and passes as part of the standard test suite.
