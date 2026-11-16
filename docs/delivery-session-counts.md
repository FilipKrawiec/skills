# Delivery session counts

For a representative clean R0/R1 delivery, the previous sequence launched five sessions: issue risk assessment, implementer, draft diff risk assessment, reviewer, and approval-only reviewer. The new sequence launches three: implementer, independent draft diff risk assessor, and independent reviewer who approves the green exact head in the same session. Drive readies and enables eligible auto-merge mechanically. Fix rounds, a changed head touching files the last assessment did not see, CI failures and owner holds can add work; configured host and model assignments remain in force. An owner-set risk label remains a floor; without an issue assessment the initial model uses R1 or the higher floor.

These are launch counts, not measured token or cost savings. Token usage depends on context, models, retries and host billing; no usage or price data was collected.

## Measured time and usage for one PR

| | Before | After (PR #572, its own round 1) |
|---|---|---|
| Reviewer sessions to an approvable verdict | 2 (review, then approval-only) | 1, approval in the same session |
| Reviewer wall time | 15-20 minutes end to end for a 2-minute implementation (owner, project thread 2026-11-16 10:45) | 2 m 17 s, risk comment 10:44:29Z to review posted 10:46:46Z |
| Reviewer usage | $0.21-0.46 per review (2026-11-16 dry-run baseline); the approval-only session added another | $0.92, 1 session, 32 in, 8936 out, 815729 cache read (usage comment on #572) |
| Next issue during CI and merge | idle until the PR merged | `drive --next` starts its implementer while the earlier PR waits |

Sources: the #572 comments at 10:44:29Z and 10:47:01Z and its CI runs (about 30 s). Round 1 of #572 returned fixes, so this is one review round and not a fully clean PR; the saving is the approval-only session that a clean PR no longer launches. The after figures were measured on this PR; no separate dry-run PR was timed.
