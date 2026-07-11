# skills
Skills for Software engineering

## Layout

- `plugins/core/skills/ddd` for Ubiquitous Language, naming, and strategic design
- `plugins/core/skills/hexagonal-architecture` for dependency inversion, encapsulation, and the 4 layered architecture (API, Application, Domain, Infrastructure)
- `plugins/workflow/skills/sdlc` for aggregate-based Task delivery with lightweight and Harness execution profiles
- `plugins/workflow/skills/tdd` for Red-Green-Refactor loop using Chicago strategy and Testcontainers
- `plugins/workflow/skills/vcs` for Git workflow with Conventional Commits and linear history
- `plugins/workflow/skills/grill-with-docs` for source-backed review and critique work
- `plugins/authoring/skills/writing-great-skill` for skill authoring and refinement
- `plugins/authoring/skills/teach` for interactive learning guides
- `docs/` for ADRs and durable project records

## Claude Code

Install from the GitHub marketplace source:

```bash
claude plugin marketplace add https://github.com/FilipKrawiec/skills.git
claude plugin install filipkrawiec-core@filipkrawiec-core
claude plugin install filipkrawiec-workflow@filipkrawiec-workflow
claude plugin install filipkrawiec-authoring@filipkrawiec-authoring
```

For local development:

```bash
claude plugin marketplace add /Users/filip/Developer/projects/github.com/FilipKrawiec/skills
claude plugin install filipkrawiec-core@filipkrawiec-core
claude plugin install filipkrawiec-workflow@filipkrawiec-workflow
claude plugin install filipkrawiec-authoring@filipkrawiec-authoring
```

## Codex

Codex plugin metadata lives in `.codex-plugin/plugin.json` and points at the core plugin package under `plugins/core/skills/`.

## Antigravity (`agy`)

Antigravity plugin metadata now lives in package roots under `plugins/*/`.
The core package id is `filipkrawiec-core`.

Install the package roots directly from GitHub:

```bash
agy plugin install https://github.com/FilipKrawiec/skills.git/plugins/core
agy plugin install https://github.com/FilipKrawiec/skills.git/plugins/workflow
agy plugin install https://github.com/FilipKrawiec/skills.git/plugins/authoring
```

For local development:

```bash
agy plugin install /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/core
agy plugin install /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/workflow
agy plugin install /Users/filip/Developer/projects/github.com/FilipKrawiec/skills/plugins/authoring
```

## Validation

Check Codex, Claude, and Antigravity plugin definitions with:

```bash
python3 scripts/validate-plugin-definitions.py
```
