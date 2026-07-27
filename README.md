# skills
Skills for Software engineering

This is a public repository. Do not add proprietary, client, or secret material to skills or `knowledge/`.

## Layout

- `plugins/common/core/skills/ddd` for Ubiquitous Language, naming, and strategic design
- `plugins/common/core/skills/hexagonal-architecture` for dependency inversion, encapsulation, and the 4 layered architecture (API, Application, Domain, Infrastructure)
- `plugins/common/orchestration/skills/orchestrate-delivery` for the default provider-neutral, code-free flow: DEFINE → SPECIFY/GRILL → PLAN → DISPATCH → COLLECT/VERIFY → REVIEW → SHIP/RETURN
- `plugins/common/workflow/skills/tdd` for Red-Green-Refactor loop using Chicago strategy and Testcontainers
- `plugins/common/workflow/skills/vcs` for Git workflow with Conventional Commits and linear history
- `plugins/common/workflow/skills/grill-with-docs` for progressive-disclosure SPECIFY/GRILL evidence and planning handoff
- `plugins/common/authoring/skills/writing-great-skill` for skill authoring and refinement
- `plugins/common/authoring/skills/teach` for interactive learning guides
- plugin manifests for package identity and the repository-wide release version
- `plugins/<agent>/*/` for agent-native overlay plugins
- `docs/` for ADRs and durable project records

## Optional local developer operations

These scripts install, link, or launch local plugin development environments. They are not part of the agent verification-loop interface.

### Claude Code

Use the common packages directly during development:

```bash
claude \
  --plugin-dir plugins/common/core \
  --plugin-dir plugins/common/workflow \
  --plugin-dir plugins/common/orchestration \
  --plugin-dir plugins/common/authoring
```

`scripts/claude-local-plugins.sh` supplies the same launcher relative to its checkout. Run it to start a new Claude Code session after changing skills; no plugin reinstall is needed.

### Codex

Add the canonical checkout as a local marketplace, then install each common package:

```bash
codex plugin marketplace add .
codex plugin add filipkrawiec-core@filipkrawiec
codex plugin add filipkrawiec-workflow@filipkrawiec
codex plugin add filipkrawiec-orchestration@filipkrawiec
codex plugin add filipkrawiec-authoring@filipkrawiec
```

Codex marks these packages as `local` and resolves them from the checkout. Restart a Codex session after edits.

### Antigravity (`agy`)

Antigravity installs a common package plus optional native overlays. The core package id is `filipkrawiec-core`.

Link the canonical checkout into Antigravity IDE's native global plugin discovery directory:

```bash
./scripts/link-agy-ide-plugins.sh --replace
```

This replaces any old copied snapshots with symlinks for the four common packages and the Antigravity-native core overlay. The IDE therefore reads the repository files directly; restart Antigravity after the first link or after changing a plugin. Use `--dry-run` to inspect the links first. To install into a workspace rather than globally, set `AGY_IDE_PLUGIN_DIR=/path/to/workspace/.agents/plugins`.

### Release hooks

Every common package and Antigravity overlay shares one release version. The annotated Git tag (`v<semver>`) is the persistent release record.

```bash
# Update every version-bearing manifest to the chosen release version, then:
git commit -m "feat: describe the release"
git tag -a v<version> -m "v<version>"
git push
```

The pre-push hook validates that the annotated tag points to `main`'s `HEAD`, all plugin and dependency versions match it, and the version advances from the prior release. `scripts/setup-git-hooks.sh` configures `push.followTags` so a normal push includes the tag. Run the validator directly before pushing when needed:

```bash
python3 scripts/validate-release-version.py
```

## Validation

The MVP verifier is implemented in Python. Its command and output contract is intentionally stable so it can be reimplemented later if standalone cross-platform distribution becomes a measured need; this does not introduce packaging or a rewrite now. See [ADR-001](docs/adr/001-provider-neutral-project-verification.md).

Check Codex, Claude, and Antigravity plugin definitions with:

```bash
python3 scripts/validate-plugin-definitions.py
```

The provider-neutral project verifier validates an opt-in project's declared task links and completion evidence:

```bash
python3 scripts/project-verify.py check --root /path/to/project
```

The project root declares only the work it wants checked:

```json
{
  "version": 1,
  "completed_states": ["done"],
  "tasks": [{
    "id": "example-change",
    "state": "done",
    "adr": "docs/adr/001-example.md",
    "docs": ["README.md"],
    "evidence": ["python3 -m unittest"]
  }]
}
```

See [ADR-001](docs/adr/001-provider-neutral-project-verification.md) for the intentionally small contract and boundary.

For an orchestrated implementation task, use manifest `version: 2`. Each task declares its isolated workspace kind, repository identity, base revision, affected paths, dependencies, parallel eligibility, execution outcome, and verifier evidence. Git worktrees are the default; `isolated-copy` is the documented fallback for a non-Git project. The CLI validates this declared provenance but never creates or cleans up worktrees.

The orchestrator creates one short-lived branch and linked worktree per implementation task from its declared base revision. It may dispatch only non-overlapping, dependency-independent tasks in parallel. Executors may commit, push verified task branches, and publish or update Review Requests; non-AFK work requires a Review Request. Only the user may authorize merge, approval, or force-push of a protected/default branch.

To validate a Central Knowledge Base or Project Knowledge root and generate its discovery index:

```bash
python3 scripts/project-verify.py knowledge-index --root /path/to/knowledge
```

For the MVP, Central Knowledge belongs at this repository's `knowledge/` root; a separate Central Knowledge repository is a future evolution.

Central Knowledge visibly contains all seven kind directories: `doctrines`, `glossary`, `preferences`, `technology-profiles`, `templates`, `examples`, and `config-artifacts`. Empty Central categories use a tracked `.gitkeep` marker, which the validator ignores. Project Knowledge remains sparse: `project-init` creates only its glossary placeholder and profile manifest; add other override directories only when needed. Entries are flat Markdown files named `<id>.md`, with front matter whose `id` matches the filename and whose `kind` is respectively `doctrine`, `glossary`, `preference`, `technology-profile`, `template`, `example`, or `config-artifact`. The command writes `.knowledge-index.json` with sorted entry metadata, including `disabled`. See the [directory contract](docs/records/knowledge-structure-contract-2026-07-27.md).

Initialize the minimum Project Knowledge surface without overwriting existing content:

```bash
python3 scripts/project-verify.py project-init --root /path/to/project
```

It creates `.project-knowledge/`, a valid glossary placeholder, `docs/adr/`, and `.project-knowledge/project-profiles.yaml`. The command is non-interactive: it creates an empty valid manifest and never asks for technology profiles. This one small project configuration manifest is the authoritative technology-profile selection surface for the CLI and agents:

```yaml
version: 1
profiles: []
```

Add active lowercase-kebab-case profile IDs as a two-space YAML list later, once the project stack is known. The CLI reads this manifest and does not infer profiles from project files. It is preserved unchanged on a repeated initialization.

After initialization, agents and users edit Project Knowledge and `project-profiles.yaml` directly. The CLI validates and reports on those artifacts and may generate an index; it intentionally has no profile-management or general content-editing commands.

Run declared selected-profile checks through the same local and CI verification loop:

```bash
python3 scripts/project-verify.py verify \
  --root /path/to/project \
  --knowledge-root /path/to/central-knowledge
```

Each selected Central Knowledge technology profile may declare one deterministic native `check` command in its front matter. The CLI resolves that declaration (including a sparse Project Knowledge override), runs it at the project root, and emits the authoritative concise result. CI invokes this same command. The CLI does not install dependencies, generate project configuration, or duplicate native tooling.

The runnable [TypeScript verification-loop example](examples/typescript-verification-loop/) selects the co-located public profile and has CI invoke this exact command. It intentionally demonstrates only the control loop; TypeScript package, lint, formatting, and test policy remain project/knowledge inputs, not generated framework behavior.

Executor routing is a local orchestrator fact, not committed project configuration. Use `${XDG_CONFIG_HOME:-~/.config}/skills/orchestrator.yaml` with the documented [local routing template](plugins/common/orchestration/skills/orchestrate-delivery/references/local-orchestrator-config.md). Validate it without changing it:

```bash
python3 scripts/project-verify.py orchestrator-config-check \
  --config "${XDG_CONFIG_HOME:-$HOME/.config}/skills/orchestrator.yaml"
```
