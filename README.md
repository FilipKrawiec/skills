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
- plugin manifests for package identity and the repository-wide release version
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

### SDLC artifact review

For SDLC changes, start an Antigravity **Planning Mode** conversation and set **Settings → Agent → Artifact Review Policy** to **Request Review**. The native overlay then requires an Antigravity Implementation Plan artifact before workspace changes; the IDE provides its built-in **Proceed** button for that artifact. Fast Mode and the **Always Proceed** policy intentionally bypass the review pause and cannot show that button.

### Headless smoke test

After installing the common SDLC package, run a disposable README task with:

```bash
./scripts/agy-smoke-test.sh
```

The runner creates and removes an isolated temporary Git repository. It uses `--prompt=...` (not the `-p` print-only switch) and enables headless command approval only for that disposable task. Set `AGY_SMOKE_MODEL` to choose another configured model. `./scripts/agy-smoke-test.sh --dry-run` verifies the generated invocation without calling Antigravity.

## Package versions

Every common package and Antigravity overlay shares one release version. The annotated Git tag (`v<semver>`) is the persistent release record.

```bash
# Update every version-bearing manifest to the chosen release version, then:
git commit -m "feat: describe the release"
git tag -a v8.3.0 -m "v8.3.0"
git push
```

The pre-push hook validates that the annotated tag points to `main`'s `HEAD`, all plugin and dependency versions match it, and the version advances from the prior release. `scripts/setup-git-hooks.sh` configures `push.followTags` so a normal push includes the tag. Run the validator directly before pushing when needed:

```bash
python3 scripts/validate-release-version.py
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
