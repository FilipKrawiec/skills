# Reviewer model and effort bench (2026-11-17)

Issue #613, slice of epic #610. Raw results: [2026-11-17-reviewer-bench-results.json](2026-11-17-reviewer-bench-results.json).

## Method

`workflow.mjs bench --run --settings sonnet:medium,opus:medium,opus:high,fable:medium` replayed `docs/review-benchmark.json` once per setting (one run per setting, 32 Reviewer sessions) through drive's Reviewer command with the setting's `--model` and `--effort`. A defect is caught when a blocking verdict names it; a false positive is a blocking verdict on a known-clean PR. Cost is the host-reported cost per session.

## Results

| Setting | Caught (3 defect) | False positives (5 clean) | Total cost | Mean per review |
| --- | --- | --- | --- | --- |
| Sonnet medium | 1 | 1 | $1.43 | $0.18 |
| Opus medium | 1 | 1 | $3.79 | $0.47 |
| Opus high | 1 | 3 | $4.58 | $0.57 |
| Fable medium | 2 | 3 | $7.84 | $0.98 |

Per risk (sample sizes: R0 none, R1 2 defect and 4 clean, R2 1 defect and 1 clean):

| Setting | R1 caught /2 | R1 false positives /4 | R2 caught /1 | R2 false positives /1 |
| --- | --- | --- | --- | --- |
| Sonnet medium | 1 | 1 | 0 | 0 |
| Opus medium | 1 | 1 | 0 | 0 |
| Opus high | 1 | 2 | 0 | 1 |
| Fable medium | 2 | 2 | 0 | 1 |

## Cheapest setting per risk matching the best recall with no more false positives

- R0: no sample in the snapshot; no recommendation.
- R1: best recall (2/2) is reached only by Fable medium, with 2 false positives against 1 for Sonnet and Opus medium, and a mean of $1.02 per R1 review, over the $1 limit. No setting qualifies. Without Fable, Sonnet medium and Opus medium tie (1/2, 1 false positive); Sonnet medium is cheaper ($0.19 against $0.49 mean).
- R2: every setting missed the one defect (#500, nested epic descendants). Sonnet and Opus medium had no false positive; Sonnet medium is cheapest ($0.15 against $0.42 mean). One defect and one clean PR show nothing about R2.

## Limits

Three known-defect PRs and five known-clean PRs, one run per setting, no repeats: a single changed verdict moves recall by 33 points, and Reviewer sessions vary run to run. Opus high flagging more clean PRs than Opus medium may be noise. Per-risk differences are not significant. The keyword catch rule can miss a defect described in other words.

## Recommendation for the owner

Make no change to drive's Reviewer selection yet. By the epic's rule (a Fable or Sonnet Reviewer only if it matches the best recall with no more false positives, Fable under $1 per review): Fable does not qualify (more false positives than Sonnet and Opus medium; over $1 at R1) and Sonnet medium does not match the best recall. Opus medium stays the Reviewer at R0 and R1; the data does not support Opus high at R2 over Opus medium (more false positives, no extra catches). Sonnet medium matches Opus medium here at about 40 percent of the cost, but only on this sample; decide whether to repeat the run (about $17 for all four settings) or to grow the snapshot with R0 and further R2 PRs before adopting it. This record changes no configuration.

## Owner decision

2026-11-17: the owner approved this record in [PR #621](https://github.com/FilipKrawiec/skills/pull/621) and chose "Keep Opus medium" for the Reviewer at every risk (epic #610; applied by #614). drive's table drops the R2 high cell to medium, `scripts/tests/workflow-decisions.test.mjs` pins Opus at medium for R0, R1 and R2, and AGENTS.md, `docs/CONCEPTS.md` and the review skill's risk reference say so. The setting is the one this record measured at R0 and R1 (Opus medium: best recall with the fewest false positives), so no rerun at a new setting applies. The rerun acceptance criterion of #614 is unmet: the one paid run per setting was already spent on the bench above.
