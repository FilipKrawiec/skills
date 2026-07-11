# EXECUTE Phase Run

Apply the latest plan through bounded workers and deterministic sensors. Use TDD role separation only when production behavior and tests are in scope. Parallel work is allowed inside EXECUTE within finite concurrency. Return a compact execution result plus verified patch/log/report Artifact References. A corrective EXECUTE run invalidates the prior review and must be followed by a fresh REVIEW.
