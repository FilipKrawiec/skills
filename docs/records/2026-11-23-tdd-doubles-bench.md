# Implementer bench: one doubles rule, tool-neutral profiles

Issue #773, epic #769. `workflow bench --implementer --run --out docs/records/2026-11-23-tdd-doubles-bench-results.json` ([result JSON](2026-11-23-tdd-doubles-bench-results.json)) replayed the two seeded tasks of [`docs/implementer-benchmark.json`](../implementer-benchmark.json) on `sessionFor('implementer', 'R0')` (sonnet, low effort) with the `tdd` skill at the working tree (this change: one doubles rule, profiles defer to the project's configured tool, a filled red-run report) and at the base commit `71376709` (without it). Exit 0, no task skipped, total cost $0.67 of the 10 USD cap.

| Arm | layers | primitives | red | gate | Overall | Cost per task | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| current (with this change) | 2/2 | 2/2 | 2/2 | 2/2 | 8/8 | $0.16 | $0.32 |
| baseline (without) | 2/2 | 2/2 | 2/2 | 2/2 | 8/8 | $0.17 | $0.35 |

The pass rate with the change equals the pass rate without it (8/8 each) at a cost per task no higher ($0.16 against $0.17). Both arms sit at the ceiling, as in the [baseline record](2026-11-23-implementer-bench-baseline.md), so the bench shows no regression, not an improvement; the cost difference is run-to-run noise.
