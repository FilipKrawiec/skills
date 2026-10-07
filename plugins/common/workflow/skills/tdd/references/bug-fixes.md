# Bug Fixes

1. Reproduce the failure as the RED test; cut setup until only the trigger remains.
2. Before editing production code, rank up to three hypotheses: "If <cause>, then <change> passes the reproduction." Diagnosis-only request: report them and stop.
3. Apply one change per hypothesis, best first; revert any that stays red. Keep the reproduction as the regression test.
