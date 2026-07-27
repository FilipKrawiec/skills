# Local Orchestrator Configuration

The local routing configuration is not committed to a project. The standard location is `${XDG_CONFIG_HOME:-~/.config}/skills/orchestrator.yaml`. An orchestrator loads that file before planning or dispatch and records its chosen executor in the task packet.

```yaml
version: 1
default_executor: antigravity
executor_failure: return-for-review
```

`default_executor` is a provider-neutral kebab-case identifier. `antigravity` is the current local example. `executor_failure` is fixed to `return-for-review`: when the selected/default executor fails, is unavailable, or cannot safely handle the slice, the orchestrator returns the slice for review/replanning. It does not automatically retry with another harness.

Validate the local file without changing it:

```bash
python3 scripts/project-verify.py orchestrator-config-check \
  --config "${XDG_CONFIG_HOME:-$HOME/.config}/skills/orchestrator.yaml"
```
