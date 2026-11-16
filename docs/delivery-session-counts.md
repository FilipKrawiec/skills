# Delivery session counts

For a representative clean R0/R1 delivery, the previous sequence launched five sessions: issue risk assessment, implementer, draft diff risk assessment, reviewer, and approval-only reviewer. The new sequence launches three: implementer, independent draft diff risk assessor, and independent reviewer who approves the green exact head in the same session. Drive readies and enables eligible auto-merge mechanically. Fix rounds, a changed head touching files the last assessment did not see, CI failures and owner holds can add work; configured host and model assignments remain in force. An owner-set risk label remains a floor; without an issue assessment the initial model uses R1 or the higher floor.

These are launch counts, not measured token or cost savings. Token usage depends on context, models, retries and host billing; the measurements below are the only usage and time data collected.

## Measured end-to-end time per PR

All figures are PR opened to PR merged, from `gh pr list --state merged` (`createdAt`, `mergedAt`), so each span covers the same thing: the draft's review, CI and merge.

| Before this change (merged PRs, 2026-11-16) | Opened to merged |
|---|---|
| #570 | 20 m 18 s |
| #568 | 19 m 48 s |
| #567 | 3 m 11 s |

The owner's 10:45 report of 15-20 minutes for a 2-minute implementation matches #570 and #568; #567 shows the sequence can be short when no round is needed. The before sequence launched an approval-only reviewer session after a clean round 1 and left the next issue idle until the merge.

**After:** no like-for-like figure exists yet. #572, the PR that makes this change, is unmerged and had a fix round (round 1 returned `fixes`), so it is neither a clean PR nor a finished timeline; its session count is therefore not evidence for the single-session approval either. For reference only, its first reviewer session took 2 m 17 s (risk comment 10:44:29Z to review 10:46:46Z) and cost $0.92 on Opus (32 in, 8936 out, 815729 cache read; usage comment on #572), against the 2026-11-16 dry-run baseline of $0.21-0.46 per review; these are one review span, not comparable with the end-to-end column above.

Record the after figure from the first clean PR merged after #572: its opened-to-merged time and reviewer session count, in the table above. Until then criterion 3 of #569 has its before side measured and its after side open.
