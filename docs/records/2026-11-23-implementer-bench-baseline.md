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

Pending. The run spends model budget, so an implementer session does not start it. Run it from the owner's or drive's session at the commit that merges this record's PR, then add the result JSON beside this file and fill the table:

```text
node plugins/common/workflow/scripts/workflow.mjs bench --implementer --run --baseline <ref> --out docs/records/2026-11-23-implementer-bench-results.json
```

| Arm | Ref | layers | primitives | red | gate | Overall | Cost per task | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current | working tree | | | | | | | |
| baseline | | | | | | | | |

The dry listing (`bench --implementer`, no `--run`) validates the snapshot and spends nothing; the checks are covered by `scripts/tests/workflow-bench.test.mjs`.
