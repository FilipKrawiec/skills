# Library host portability audit

Recorded 2026-11-14 for [#493](https://github.com/FilipKrawiec/skills/issues/493). This inventory distinguishes files and syntax from working host integration. The [delivery capability record](2026-11-14-delivery-host-capabilities.md) describes observed Codex and Claude evidence and the separate identity and review requirements. Recheck each host and configuration after changes. No host or model is universally supported by this audit.

| Paths and finding | Host applicability and evidence | Disposition |
| --- | --- | --- |
| `plugins/common/{core,workflow,authoring}/skills/**` and references | All hosts: Markdown instructions and frontmatter; `allowed-tools` uses host-specific tool names. The manifest validator checks syntax and provider names, not actual skill invocation or enforcement. | Retain portable prose and Claude-compatible metadata. Verify loading, tool access and invocation on the actual host; metadata is not an authority boundary. |
| `plugins/common/workflow/agents/*.md` | Claude role definitions specify `model: sonnet`. Codex delivery uses configured roles and explicit briefs; preload behavior is unverified. Antigravity's validator reports all three model tiers invalid and skips the agents. | Preserve Claude compatibility. Antigravity workflow roles are unsupported until native loading and dispatch are demonstrated. |
| `plugins/common/workflow/hooks/hooks.json`, `scripts/git-guard.mjs` | Claude-shaped `PreToolUse` hook uses `CLAUDE_PLUGIN_ROOT`. Antigravity validator reports this location never loads. Codex hook execution is unverified. | Keep the Claude hook; do not rely on it as a cross-host security boundary. Use the workflow CLI, configured identity and GitHub protections on every host. |
| `plugins/common/*/{package-metadata.json,plugin.json,.claude-plugin/plugin.json,.codex-plugin/plugin.json}`, `.agents/plugins*`, `.claude-plugin/marketplace.json`, `scripts/tests/workflow-{layout,manifests}.test.mjs` | Generated manifests and catalog shape are tested locally; file presence does not prove installation or runtime support. Antigravity workspace declaration exists but automatic discovery was not observed. | Retain the formats, qualify installation claims and test structural facts only. Validate each installed host. |
| `plugins/common/workflow/scripts/**`, `scripts/tests/**` | Node/Git/GitHub CLI tooling and Unix-like push have project and platform prerequisites independent of plugin discovery. Claude delivery dispatch is measured. Codex: implementer measured, Reviewer below the Opus baseline, Codex-hosted orchestration unmeasured (see Codex dry run below). Antigravity dispatch explicitly stops. Fixtures test contracts, not real accounts or native sessions. | Keep #483 delivery implementation and all scope, exact-head review, configured identity and quality gates. Missing capabilities block the affected action. |
| `README.md`, `CONTRIBUTING.md`, `docs/CONCEPTS.md`, `docs/adr/**`, `.agents/**` | Installation and operating instructions distinguish manifests from dispatch, credentials and production authority. Historical records describe their own time and are not current capability guarantees. | Link this audit and qualify current claims; retain historical records. Other hosts are unverified. |
| `justfile` (`link-agy`, `validate-agy`), `scripts/tests/workflow-local-install.test.mjs` | Linking is tested in temporary directories and proves symlinks only. `agy plugin --help` advertises validation; `just validate-agy` on this machine returned 1: authoring and core passed, workflow failed on three agents and warned about the hook. Its loop can mask an earlier failure if a later validation succeeds. | Treat native validation output package by package, not the recipe status alone. Fixing the recipe requires expanding #493's scope to `justfile`; no claim of successful workflow validation. |

The local Antigravity CLI's help also advertises model and agent flags, but that is not evidence of subagent dispatch, model selection, intact hand-back, independent reviewer identity or successful skill execution. Neither validator results nor shared-host processes prove credential isolation. The configured reviewer must remain distinct from author and latest pusher, approve the exact head, and be enforced by effective GitHub protections; production approval remains separate.

## Follow-up for #503

Removing host-specific model tiers from workflow role frontmatter allowed `agy plugin validate` to report 11 skills and 3 agents, with the hook still unloaded. A temporary renamed plugin installed with `agy plugin install` listed all 11 skills and the devops, implementer and reviewer roles; `agy agent` listed those roles. The probe plugin was then uninstalled. The CLI advertises `--agent` and `--model`, and `agy models` listed available models, but role execution, model selection and intact hand-back were not demonstrated. Stop Antigravity delivery dispatch and use a supported orchestrator until those capabilities are verified. Claude delivery assigns models explicitly; role definitions without a model inherit the invoking host default outside that workflow. The independent reviewer identity, exact-head review, scope and project gates still apply.

## Codex dry run, 2026-11-16

Measured with codex-cli 0.167.1 and model gpt-6.1-terra, on the same harness, fixtures and fresh-Opus judge as the Opus and AGY dry run that morning, in detached worktrees with no GitHub writes.

| Implementer replay | Independent gate | Criteria | Blocking | Score | Time |
| --- | --- | --- | --- | --- | --- |
| #481 | pass | 4/4 | 0 | 5 | 229 s |
| #531 | pass | 4/4 | 0 | 4 | 77 s |
| #544 | pass | 4/4 | 0 | 4 | 146 s |
| #549 | gate fail | | | | |

Opus baseline: 4/4 gate passes, scores 3, 4, 4 and 3, 3 blocking defects, 236-409 s. The Codex implementer passed 3 of 4 and scored at or above Opus.

Reviewer recall on known-defect PRs: #539 missed, #543 missed, #555 caught, so Codex caught 1 of 3 against Opus's 2 of 3. It is not recommended as the sole Reviewer.

Not exercised: drive orchestration run from a Codex host. Claude spend for the judge and grader was $1.13; Codex reports tokens only.
