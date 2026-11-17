# Sonnet-low drive delivery measured against the #606 baseline (issue #615, epic #610)

Verdict: **owner steps and dispatches met; cost below baseline not shown (reviewer cost is higher, total cost unknown); Reviewer recall waived by the owner.** Nothing is rounded in our favour.

## Measured epic

Epic #635 (approval-free project setup), delivered by drive session `local_55e8c433-fbfe-4d54-bb20-de1417b365f5`. Evidence: [approval-free setup delivery](2026-11-17-approval-free-setup-delivery.md), from the session's `get_session` row and the `workflow:usage` rows.

| Criterion | Result |
| --- | --- |
| Drive session model and effort | `claude-sonnet-5-5`, `low` (met) |
| Failed agent dispatches | 0 (met) |
| Owner steps beyond those the epic reserved | 0; two steps, both the epic's typed go-ahead (met) |

Refusals that were not dispatch failures (classifier denials, an orphaned lock, an Owner-check block) are listed in the linked record; #639, #641 and #622 fixed their causes.

## Cost per merged PR against the #606 baseline

| | #606 baseline (stagely-pro #1611) | #635 |
| --- | --- | --- |
| Median total cost per merged drive PR | $1.96 (upper bound, all roles) | unknown: implementer, devops, planner and drive-session usage are unreported |
| Median Reviewer-only cost per merged PR | $0.51 (0.44, 0.47, 0.51, 0.83, 1.13) | $1.03 (0.91, 1.02, 1.03, 1.29, 1.72) |

The like-for-like Reviewer figure is **higher** in #635 (2-3 Reviewer sessions per PR on policy-path PRs, including the `review:owner` hold), so the claim "median below baseline" is not supported by the data. The total cannot be compared until the host reports every role. Per the owner's decision on #615 (2026-11-17 17:55) the full per-role comparison carries to the next Sonnet-low epic via #659. This miss and its cause still need to be raised to the owner on #610; this record does not claim that has happened (the PR's coordinator posts it, and #610 is the place to look).

## Reviewer recall

Applied setting: Opus at medium effort at every risk. On 2026-11-17 at 11:15:53Z the owner chose "Medium everywhere, waive" ([PR #623](https://github.com/FilipKrawiec/skills/pull/623#issuecomment-6946481771)), waiving the bench rerun that would reach 2/3 recall (#614 criterion 4). The last bench ([record](2026-11-17-reviewer-model-effort-bench.md)) gave Opus medium 1/3 recall with 1 false positive in 5. No new bench was run; the real-epic data above stands in for it: #635's five PRs each merged on a Reviewer-approved exact head, with 1 to 3 Reviewer sessions each.
