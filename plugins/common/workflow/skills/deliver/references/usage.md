# Subagent usage

The host's subagent facility returns the answer without usage, so derive it from the subagent's transcript.

- Transcript: the subagent's `agent-<id>.jsonl` under `subagents/` in the dispatching session's project directory (`<host home>/projects/<project>/<session>/subagents/`); the `<id>` is the agent id the host reported on dispatch.
- Run `<cli> usage-line <transcript>`; it sums each message id once and prints the `usage:` line to add to the hand-back.
- Add `--rates IN,OUT,CACHE_READ,CACHE_WRITE` (USD per million tokens) only from the model's published prices or the project's recorded rates. Never invent rates: without them cost stays `unreported` and tokens still count.
- No transcript found or no line printed: leave the hand-back without `usage:`; the row reads `unreported`.
