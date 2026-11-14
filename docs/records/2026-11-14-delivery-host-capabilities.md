# Delivery host capability evidence

Recorded 2026-11-14 for [#486](https://github.com/FilipKrawiec/skills/issues/486). This is an investigation, not authorization or a dispatch design. Documentation describes possible behavior; it does not prove a configured host, account, model, identity, or independent review works. Recheck after host upgrades or configuration changes.

## Local observations

From the issue worktree, `codex --version` returned `codex-cli 0.167.1` (with a PATH-alias permission warning); `claude --version` returned `2.1.325 (Claude Code)`. Run these commands again to identify the tested binaries. `claude --help` describes `--agents` and `--agent`, `--model`, `--print`, `--output-format`, `--forward-subagent-text`, `--bg`, `--resume`, and `--worktree`. These are help-text observations, not a successful dispatch. The active Codex desktop session delivered this bounded implementer brief as a separate child agent and exposes messaging and a final response to its parent; this is an observation of this session, not a reproducible CLI test or evidence of reviewer independence. No separate reviewer was dispatched in this investigation. No Claude agent was run. Host/account availability and actual hand-back behavior remain unverified.

## Source evidence and limits

Sources accessed 2026-11-14; use the linked pages and local `--help` to reproduce the documentation check. Versions of online documentation are not pinned.

| Capability | Codex | Claude Code |
| --- | --- | --- |
| Implementer dispatch | [Codex multi-agent documentation](https://developers.openai.com/codex/multi-agent/) describes delegation to subagents and configurable roles. This session's child delivery was observed above. | [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) describes delegation to custom subagents. Local help advertises `--agents` and `--agent`; execution was not tested. |
| Separate reviewer dispatch | [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive/) describes a separate `codex exec` invocation. A separate process alone does not establish independent identity or review. Actual reviewer dispatch and credentials are unverified. | [Claude Code headless mode](https://code.claude.com/docs/en/headless) describes `claude -p`; local help also describes background sessions. A separate session alone does not establish independent identity or review. Actual reviewer dispatch and credentials are unverified. |
| Role and model | The Codex multi-agent documentation describes agent roles and per-role configuration. This does not prove a named model is available in a particular session. | The subagent documentation describes custom instructions and model selection; local help advertises `--model` and agent definitions. Availability and effective selection are unverified. |
| Hand-back | The Codex documentation describes subagent results returning to the parent; non-interactive mode documents final output. This session has a final response channel; parsing the drive envelope has not been tested. | The subagent documentation describes returning results to the parent; headless mode describes output formats. Local help advertises forwarding subagent text in stream JSON. The drive envelope and failure handling have not been tested. |

## Required stops

- If dispatch, the requested role/model, completion status, or an intact hand-back cannot be demonstrated in the actual host and configuration, stop and report the missing evidence; do not infer success from a process starting or substitute a model silently.
- Keep the existing worktree and scope isolation and verify the actual working directory and changed paths. A child agent or separate session does not itself isolate a filesystem or credentials.
- Keep the existing reviewer identity and exact-head review gates. A fresh context or separate process is not proof of a distinct authorized GitHub identity, an independent reviewer, or an approval. If identity, isolation, exact head, or review submission cannot be verified, stop before advancing the PR and request the appropriate owner action.
- Preserve failures and ambiguous or missing hand-backs for diagnosis; do not treat them as approval or completion. Do not change the active GitHub identity to probe capabilities.

[#409](https://github.com/FilipKrawiec/skills/issues/409) removed the unattended AFK factory; delivery remains initiated from an owner session. This record does not restore unattended operation. [#431](https://github.com/FilipKrawiec/skills/pull/431) is still draft; this record neither adopts its unapproved effort choices nor adds a binding design. The dependent dispatch slice must validate its concrete host integration and retain the existing gates.
