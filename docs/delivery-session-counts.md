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

**After (#569's measurement, recorded by epic #560's final refinement):** the first clean PR merged after #572 is #574, with one commit, one risk head and a `ready` verdict in round 1. Opened to merged: 5 m 22 s (11:12:12Z to 11:17:34Z). Reviewer sessions: 2, not 1. Its usage comment lists the round-1 verdict session ($0.93, 52 in, 9657 out) and a second session that approved the green head ($0.37), so the reviewer approval is still a separate session and the saving of #572 is in the removed risk sessions only. Later clean PRs repeat the pattern (#580 $0.82 then $0.29, #584 $0.53 then $0.35); the gap and a proposed fix are in [the epic refinement](records/2026-11-16-measured-review-refinement.md). #572 itself (4 rounds, $2.22, 18 m 12 s) is not a clean PR; its first review cost $0.92 against the $0.21-0.46 dry-run baseline, which the refinement explains and accepts with a reason.
