# skills
Skills for Software engineering

## Layout

- `plugins/core/skills/ddd` for Ubiquitous Language, naming, and strategic design
- `plugins/core/skills/hexagonal-architecture` for dependency inversion, encapsulation, and the 4 layered architecture (API, Application, Domain, Infrastructure)
- `plugins/workflow/skills/sdlc` for the 7-phase SDLC playbook with YAML record tracking
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
claude plugin install filipkrawiec@filipkrawiec
claude plugin install filipkrawiec@filipkrawiec-workflow
```

For local development:

```bash
claude plugin marketplace add /Users/filip/Developer/projects/github.com/FilipKrawiec/skills
claude plugin install filipkrawiec@filipkrawiec
claude plugin install filipkrawiec@filipkrawiec-workflow
```

## Codex

Codex plugin metadata lives in `.codex-plugin/plugin.json` and points at the core plugin package under `plugins/core/skills/`.

## Antigravity (`agy`)

Antigravity plugin metadata lives in `plugin.json` at the root of the repository, using the core plugin package under `plugins/core/skills/`.

Install from GitHub remote:

```bash
agy plugin install https://github.com/FilipKrawiec/skills.git
```

For local development:

```bash
agy plugin install /Users/filip/Developer/projects/github.com/FilipKrawiec/skills
```

## Validation

Check Codex, Claude, and Antigravity plugin definitions with:

```bash
python3 scripts/validate-plugin-definitions.py
```
