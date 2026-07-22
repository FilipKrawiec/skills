# skills
Skills for Software engineering

## Layout

- `plugins/common/core/skills/ddd` for Ubiquitous Language, naming, and strategic design
- `plugins/common/core/skills/hexagonal-architecture` for dependency inversion, encapsulation, and the 4 layered architecture (API, Application, Domain, Infrastructure)
- `spec/autonomous-sdlc` for the internal Autonomous SDLC domain specification; `plugins/common/sdlc/skills/sdlc` for agent guidance that applies it
- `plugins/common/workflow/skills/tdd` for Red-Green-Refactor loop using Chicago strategy and Testcontainers
- `plugins/common/workflow/skills/vcs` for Git workflow with Conventional Commits and linear history
- `plugins/common/workflow/skills/grill-with-docs` for source-backed review and critique work
- `plugins/common/authoring/skills/writing-great-skill` for skill authoring and refinement
- `plugins/common/authoring/skills/teach` for interactive learning guides
- `plugins/common/*/package-metadata.json` for package identity and release version
- `plugins/<agent>/*/` for agent-native overlay plugins
- `docs/` for ADRs and durable project records

## Claude Code

Use the common packages directly during development:

```bash
claude \
  --plugin-dir plugins/common/core \
  --plugin-dir plugins/common/workflow \
  --plugin-dir plugins/common/sdlc \
  --plugin-dir plugins/common/authoring
```

`scripts/claude-local-plugins.sh` supplies the same launcher relative to its checkout. Run it to start a new Claude Code session after changing skills; no plugin reinstall is needed.

## Codex

Add the canonical checkout as a local marketplace, then install each common package:

```bash
codex plugin marketplace add .
codex plugin add filipkrawiec-core@filipkrawiec
codex plugin add filipkrawiec-workflow@filipkrawiec
codex plugin add filipkrawiec-sdlc@filipkrawiec
codex plugin add filipkrawiec-authoring@filipkrawiec
```

Codex marks these packages as `local` and resolves them from the checkout. Restart a Codex session after edits.

## Antigravity (`agy`)

Antigravity installs a common package plus optional native overlays. The core package id is `filipkrawiec-core`.

Link the canonical checkout into Antigravity IDE's native global plugin discovery directory:

```bash
./scripts/link-agy-ide-plugins.sh --replace
```

This replaces any old copied snapshots with symlinks for the four common packages and two Antigravity-native overlays. The IDE therefore reads the repository files directly; restart Antigravity after the first link or after changing a plugin. Use `--dry-run` to inspect the links first. To install into a workspace rather than globally, set `AGY_IDE_PLUGIN_DIR=/path/to/workspace/.agents/plugins`.

### Headless smoke test

After installing the common SDLC package, run a disposable README task with:

```bash
./scripts/agy-smoke-test.sh
```

The runner creates and removes an isolated temporary Git repository. It uses `--prompt=...` (not the `-p` print-only switch) and enables headless command approval only for that disposable task. Set `AGY_SMOKE_MODEL` to choose another configured model. `./scripts/agy-smoke-test.sh --dry-run` verifies the generated invocation without calling Antigravity.

## Package versions

Versions are independent by package. Bump only the package being released:

```bash
python3 scripts/bump-version.py --plugin workflow --type major
python3 scripts/bump-version.py --plugin sdlc --type major
```

## Validation

Check Codex, Claude, and Antigravity plugin definitions with:

```bash
python3 scripts/validate-plugin-definitions.py
```

## Update

To update Antigravity IDE links and check the repository, run:

```bash
./scripts/update-plugins.sh
```
