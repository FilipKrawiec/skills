# skills
Skills for Software engineering

## Layout

- `plugins/core/skills/ddd` for Ubiquitous Language, naming, and strategic design
- `plugins/core/skills/hexagonal-architecture` for dependency inversion, encapsulation, and the 4 layered architecture (API, Application, Domain, Infrastructure)
- `plugins/sdlc/skills/sdlc` for self-contained SDLC orchestration, state records, templates, validation, and measurement tools
- `plugins/workflow/skills/tdd` for Red-Green-Refactor loop using Chicago strategy and Testcontainers
- `plugins/workflow/skills/vcs` for Git workflow with Conventional Commits and linear history
- `plugins/workflow/skills/grill-with-docs` for source-backed review and critique work
- `plugins/authoring/skills/writing-great-skill` for skill authoring and refinement
- `plugins/authoring/skills/teach` for interactive learning guides
- `docs/` for ADRs and durable project records

## Claude Code

Use the canonical checkout directly during development. Git is only the way that
checkout is synchronized; Claude loads the plugin files from the directory.
Its normal marketplace installation is cached, so use the directory loader
instead of `claude plugin install` while developing:

```bash
claude \
  --plugin-dir /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/core \
  --plugin-dir /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/workflow \
  --plugin-dir /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/sdlc \
  --plugin-dir /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/authoring
```

`scripts/claude-local-plugins.sh` supplies the same launcher relative to its
checkout. Run it to start a new Claude Code session after changing skills; no
plugin reinstall is needed.

## Codex

Add the canonical checkout as a local marketplace once, then install each
package once:

```bash
codex plugin marketplace add /Users/filip/Developer/projects/github.com/FilipKrawiec/skills
codex plugin add filipkrawiec-core@filipkrawiec
codex plugin add filipkrawiec-workflow@filipkrawiec
codex plugin add filipkrawiec-sdlc@filipkrawiec
codex plugin add filipkrawiec-authoring@filipkrawiec
```

Codex marks these packages as `local` and resolves their paths in the
marketplace checkout. Restart a Codex session after edits; no reinstall or
marketplace upgrade is needed.

## Antigravity (`agy`)

Antigravity plugin metadata now lives in package roots under `plugins/*/`.
The core package id is `filipkrawiec-core`.

Install package roots from the canonical local checkout:

```bash
agy plugin install /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/core
agy plugin install /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/workflow
agy plugin install /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/sdlc
agy plugin install /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/authoring
```

AGY accepts those absolute local directories. Reload its host after an edit;
if a host build caches imported skills, re-run the same local command rather
than installing from Git.

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

To update all installed plugins (both Claude and Antigravity) with the latest versions from the repository, run:

```bash
./scripts/update-plugins.sh
```
