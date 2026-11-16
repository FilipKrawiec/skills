# Delivery session counts

For a representative clean R0/R1 delivery, the previous sequence launched five sessions: issue risk assessment, implementer, draft diff risk assessment, reviewer, and approval-only reviewer. The new sequence launches three: implementer, independent draft diff risk assessor, and independent reviewer who approves the green exact head in the same session. Drive readies and enables eligible auto-merge mechanically. Fix rounds, a changed head touching files the last assessment did not see, CI failures and owner holds can add work; configured host and model assignments remain in force. An owner-set risk label remains a floor; without an issue assessment the initial model uses R1 or the higher floor.

These are launch counts, not measured token or cost savings. Token usage depends on context, models, retries and host billing; no usage or price data was collected.

## Measured time for one clean PR

| | Before | After |
|---|---|---|
| Sessions | 5 launches, the last approval-only | 3 launches; approval in the reviewer session |
| Wall time, 2-minute implementation | 15-20 minutes (2026-11-16 project thread, 10:45) | not yet measured: record the first clean PR delivered with this change |
| Next issue during CI and merge | idle until the PR merged | `drive --next` starts its implementer while the earlier PR waits |

The before figure is the owner's measurement of one delivery; no token or cost usage was collected for either column.
