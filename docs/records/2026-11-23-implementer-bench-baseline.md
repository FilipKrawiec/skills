# Implementer bench baseline

Issue #771, epic #769. `workflow bench --implementer` replays the seeded implementer tasks of [`docs/implementer-benchmark.json`](../implementer-benchmark.json) with the skills at the working tree (`current`) and at a baseline ref (`baseline`, default the merge base with the default branch), graded only by deterministic checks.

## Setup

| Item | Value |
| --- | --- |
| Setting | `sessionFor('implementer', 'R0')`: sonnet, low effort |
| Brief | drive's `implementerBrief`, with the project's architecture skills and language profiles |
| Spend cap | 10 USD reported cost; no new task starts after it, skipped tasks are listed |
| Tasks | `ts-users-change-email`, `ts-orders-cancel` (TypeScript fixtures under `docs/implementer-benchmark/`, gate `node --test`) |
| Checks | `layers` (no domain import of an app, api or infra path), `primitives` (no raw string, number or boolean on a public domain signature), `red` (the new test fails on the starting tree), `gate` |

## Result

Run with `bench --implementer --run --out docs/records/2026-11-23-implementer-bench-results.json` ([result JSON](2026-11-23-implementer-bench-results.json)); exit 0, no task skipped, total cost $0.72 of the 10 USD cap. Both arms ran the same skills (the baseline ref is `2155f801`, before this PR), so this is the baseline every later skill change compares against with `--compare`.

| Arm | Ref | layers | primitives | red | gate | Overall | Cost per task | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current | working tree | 2/2 | 2/2 | 2/2 | 2/2 | 8/8 (1) | $0.20 | $0.39 |
| baseline | 2155f801 | 2/2 | 2/2 | 2/2 | 2/2 | 8/8 (1) | $0.16 | $0.33 |

Both arms pass every check, so the two seeded tasks do not yet separate skill wordings (a ceiling effect); the cost difference is run-to-run noise at two tasks per arm. A later change to `ddd`, `hexagonal-architecture` or `tdd` needs harder seeded tasks before it can show a higher pass rate.

The dry listing (`bench --implementer`, no `--run`) validates the snapshot and spends nothing; the checks are covered by `scripts/tests/workflow-bench.test.mjs`.
