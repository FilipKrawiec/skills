# Implementer bench: the seeded `ts-stock-reserve` task

Issue #784, PR #785. `node plugins/common/workflow/scripts/workflow.mjs bench --implementer --run --baseline origin/main --out docs/records/2026-11-24-implementer-bench-784-results.json` (exit 0; [result JSON](2026-11-24-implementer-bench-784-results.json)) replays the three seeded TypeScript tasks of [`docs/implementer-benchmark.json`](../implementer-benchmark.json) on `sessionFor('implementer', 'R0')` (sonnet, low effort). One arm uses the skills at the working tree (`current`), the other the skills at `origin/main` (`baseline`). Both arms use the same fixtures, from the working tree. Spend cap 10 USD, total cost $1.02, no task skipped, every row reported its cost.

| Arm | layers | primitives | red | gate | Overall | Cost per task | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| current (this change) | 3/3 | 3/3 | 3/3 | 3/3 | 12/12 | $0.17 | $0.50 |
| baseline (origin/main) | 3/3 | 3/3 | 3/3 | 3/3 | 12/12 | $0.17 | $0.52 |

| Task | current | baseline |
| --- | --- | --- |
| ts-users-change-email | pass | pass |
| ts-orders-cancel | pass | pass |
| ts-stock-reserve | pass | pass |

## Verdict

**Result against the wording then in force, "a seeded task the pre-change skills fail" (since superseded; see the current criteria of #784): not met.** The baseline arm passes `ts-stock-reserve`, and so does the current arm. Both arms score 12/12, so the bench is still at its ceiling.

This is the second run. In the first run (cost $1.04), both arms failed `ts-stock-reserve` on `primitives`. That failure came from the fixture, not the agents: the fixture's own port `save(item, loaded): Promise<boolean>` in [`stock.ts`](../implementer-benchmark/ts-stock/src/stock/domain/stock.ts) failed the check before any agent touched the code. The fixture now returns a domain outcome type, `SaveOutcome` (`Saved | Refused`), so its starting tree passes `layers` and `primitives`. The check itself is unchanged. `scripts/tests/workflow-bench.test.mjs` ("each committed fixture starts clean on the static checks") now keeps every seeded fixture clean on those two checks. The task's issue text is unchanged.

The four checks are static (`layers`, `primitives`) or run the agent's own tests (`red`, `gate`). None of them tests the `Conflict` invariant against hidden expectations, so an invariant on external state does not separate the arms on this bench. A follow-up could add a check that runs a held-out acceptance test per task. That change belongs to the bench's design, outside this fix.

## Delivery rates

`.agents/config.json` is outside this issue's scope packet, so this PR does not set `delivery.rates`. Until a separate change adds it, implementer and devops rows stay `unreported`. The rate to apply for `claude-sonnet-5-5` is `[2, 10, 0.1, 2.5]` USD per million tokens (input, output, cache read, cache write). Source: the [Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing), row Claude Sonnet 5.5: $2 input, $10 output, $0.10 cache hits, $2.50 5-minute cache writes (read 2026-11-24). The reviewer rows use the alias `opus`, which does not name one model, and they already carry a host-reported cost, so no Opus rate is proposed.
