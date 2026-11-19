# Session logs

Each brief carries `Session: <id>`, issued by `drive` (derived from the state the brief describes, so a rerun repeats it); a runner-started orchestrator uses `WORKFLOW_DRIVE_SESSION`, a UUID the runner also passes as the agent's `--session-id`, so the transcript is named by it.

When `drive` gets a hand-back (`drive N --hand-back`), `review-session.mjs` ends, or a runner-started orchestrator returns `done`, `owner` or `blocked`:

1. Find the session's transcript (the agent host's JSONL transcript store, by file name or by the id it contains).
2. Redact GitHub tokens, API keys, `Authorization`/`Bearer` values, private-key blocks and the values of environment variables named TOKEN, SECRET, KEY or PASSWORD as `[REDACTED]`. A surviving known secret refuses the upload.
3. Add it to the PR's secret gist owned by the bot (one gist per PR, one file per session: `<role>-<n>-<session-id>.jsonl`).
4. Post one PR comment per session: role, model, effort, duration, usage, outcome and the file link, with a hidden marker keyed on the session id so a rerun never posts or uploads it twice.

A failure (no transcript, refusal, GitHub error) is appended to `session-log.log` in the runner log directory and the session is commented as missing once; a later run completes that comment. Gists and comments are kept after merge. `status NUMBER` totals usage by role and model from these records.
