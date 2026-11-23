# Implementer bench: the seeded `ts-stock-reserve` task

Issue #784, PR #785. `node plugins/common/workflow/scripts/workflow.mjs bench --implementer --run --baseline origin/main --out docs/records/2026-11-24-implementer-bench-784-results.json` (exit 0; [result JSON](2026-11-24-implementer-bench-784-results.json)) replays the three seeded TypeScript tasks of [`docs/implementer-benchmark.json`](../implementer-benchmark.json) on `sessionFor('implementer', 'R0')` (sonnet, low effort) with the skills at the working tree (`current`) and at `origin/main` (`baseline`). Spend cap 10 USD, total cost $1.04, no task skipped, every row reported its cost.

| Arm | layers | primitives | red | gate | Overall | Cost per task | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| current (this change) | 3/3 | 2/3 | 3/3 | 3/3 | 11/12 | $0.19 | $0.56 |
| baseline (origin/main) | 3/3 | 2/3 | 3/3 | 3/3 | 11/12 | $0.16 | $0.48 |

| Task | current | baseline |
| --- | --- | --- |
| ts-users-change-email | pass | pass |
| ts-orders-cancel | pass | pass |
| ts-stock-reserve | **fail** (primitives) | **fail** (primitives) |

## Verdict

**The criterion "a seeded task the pre-change skills fail" is met only in the letter: the baseline arm fails `ts-stock-reserve`, and so does the current arm, so the task does not separate the two.** The pass rate is equal (11/12 in both arms), not higher.

The failure is the same violation in both arms: `src/stock/domain/stock.ts: save uses Promise<boolean>`. Line 29 of the seeded fixture, [`stock.ts`](../implementer-benchmark/ts-stock/src/stock/domain/stock.ts), declares the repository port `save(item, loaded): Promise<boolean>` before any agent touches it, and the `primitives` check reads public domain signatures. Both arms leave that line in place, because the fixture's own tests and `memory-stock.ts` depend on it. So the check fails on the starting tree and measures the fixture, not the skills. `layers`, `red` and `gate` pass in both arms on this task, so the `Conflict` invariant (the criterion the task was added for) is not what the bench graded.

The task was left unchanged, as the owner asked for the honest result. Follow-up for the owner: either let the fixture's port return a domain type (for example a `Saved | Refused` result) so the `primitives` check can pass, or exempt a port's outcome type from that check, then rerun; only then can the task show a higher pass rate for either arm.

## Delivery rates

`.agents/config.json` is outside this issue's scope packet, so this PR does not set `delivery.rates`; implementer and devops rows stay `unreported` until a separate change adds it. The rate to apply for `claude-sonnet-5-5` is `[2, 10, 0.1, 2.5]` USD per million tokens (input, output, cache read, cache write). Source: the [Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing), row Claude Sonnet 5.5: $2 input, $10 output, $0.10 cache hits, $2.50 5-minute cache writes (read 2026-11-24). The reviewer rows use the alias `opus`, which does not name one model, and they already carry a host-reported cost, so no Opus rate is proposed.
