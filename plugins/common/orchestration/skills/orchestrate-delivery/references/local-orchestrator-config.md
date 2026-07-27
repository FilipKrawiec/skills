# Local Orchestrator Configuration

The local routing configuration is not committed to a project. The standard location is `${XDG_CONFIG_HOME:-~/.config}/skills/orchestrator.yaml`. An orchestrator loads that file before planning or dispatch and records its chosen executor in the task packet.

```yaml
version: 1
default_executor: antigravity
tracker: local-tracker
review_provider: local-review
executor_failure: return-for-review
```

`default_executor`, `tracker`, and `review_provider` are provider-neutral kebab-case identifiers. `antigravity`, `local-tracker`, and `local-review` are local examples, not host integrations. The orchestrator records the selected tracker and review-provider identifiers in a published task's Delivery Record and Review Request evidence; this config does not prescribe an API or create external records. `executor_failure` is fixed to `return-for-review`: when the selected/default executor fails, is unavailable, or cannot safely handle the slice, the orchestrator returns the slice for review/replanning. It does not automatically retry with another harness.

Validate the local file without changing it:

```bash
python3 scripts/project-verify.py orchestrator-config-check \
  --config "${XDG_CONFIG_HOME:-$HOME/.config}/skills/orchestrator.yaml"
```
