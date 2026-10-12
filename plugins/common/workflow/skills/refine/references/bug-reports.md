# Bug reports

A fresh bug report waits in `lane:proposed` or without a lane, with an unconfirmed cause and a rough packet, so no run can take it. A since-last-pass filter never revisits it. Ground each fetched report before its lane, as the triage `spec` runs unattended: it restores the report's own expected behaviour, so a criterion beyond that stays a proposal in the report.

1. Trace the observed behaviour to the base's code. State the cause with `file:line`, marked confirmed (the code shows it) or suspected (and what would confirm it). A cause the base already fixed goes to reconcile case 2 with that evidence.
2. Add a criterion that a named test reproduces the report and fails before the fix.
3. Narrow the scope packet to the files the fix and its tests change, plus the always-in-scope docs a visible fix updates. Write the estimate's main unknown in one sentence.
4. Invoke `spec` to triage it against its AFK-ready checks: all hold → `lane:proposed` and Todo; a decision only the owner can make → `lane:owner` with the question. Never add `lane:afk`.
5. Append `<!-- refined base=<short sha> -->` to the body, so later passes treat it as any other item.

Report each grounded report in the Summary, for example `Bugs: grounded #24 (cause confirmed, lane:proposed); #25 needs a layout choice (lane:owner).`
