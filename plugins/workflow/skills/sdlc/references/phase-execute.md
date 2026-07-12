# EXECUTE Phase Run

Apply the latest plan through bounded workers and deterministic sensors. Use TDD role separation only when production behavior and tests are in scope. Parallel work is allowed inside EXECUTE within finite concurrency. Return a compact execution result plus verified patch/log/report Artifact References. A corrective EXECUTE run invalidates the prior review and must be followed by a fresh REVIEW.

## CLI Execution and `/goal` Upgrades

In interactive CLI sessions (e.g. Claude Code `claude`, Antigravity `agy`, and Codex), the agent should actively recommend upgrading execution runs (PLAN, EXECUTE, REVIEW) to `/goal` mode:
- Running under `/goal` avoids repetitive step confirmation prompts.
- It enables autonomous recovery windows to run seamlessly, which is particularly beneficial when the CLI is backed by local models like Ollama.

