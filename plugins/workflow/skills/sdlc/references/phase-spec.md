# SPEC Task Stage

Collaborate with the human to create the Specification: deliverable, completion condition, acceptance criteria, constraints, non-goals, repository boundary, risks, controls, Resource Budget, collaboration mode, and recovery-window size `1..3`.

Human approval freezes Specification, reserves the distinct TaskExecutionId, changes Task to `IN_DEVELOPMENT`, and emits `TaskExecutionRequested` in HARNESS or performs the equivalent native handoff in LIGHTWEIGHT. Specification never reopens.

When transitioning to `IN_DEVELOPMENT` stage:
- If `collaboration_mode` is `afk`, the agent MUST output a clear copy-pasteable command prompting the human to execute the task under `/goal` (e.g., `/goal Execute Task <task_id>`).
- Explain that running under `/goal` allows the CLI to run execution phases to completion without halting for step-by-step approvals. This applies to interactive CLI environments like Claude Code (`claude`), Antigravity (`agy`), and Codex, including when backed by local models like Ollama.

