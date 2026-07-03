# skills
Skills for Software engineering

## Layout

- `skills/grill-with-docs` for source-backed review and critique work
- `skills/writing-great-skill` for skill authoring and refinement
- `skills/domain-driven-design` for Ubiquitous Language, naming, and strategic design
- `skills/hexagonal-architecture` for dependency inversion, encapsulation, and the 4 layered architecture (API, Application, Domain, Infrastructure)
- `skills/tdd` for Red-Green-Refactor loop using Chicago strategy and Testcontainers
- `skills/sdlc` for the 7-phase playbook of the Agentic Delivery Cycle and 4D principles
- `docs/` for ADRs and durable project records

## Claude Code

Install from the GitHub marketplace source:

```bash
claude plugin marketplace add https://github.com/FilipKrawiec/skills.git
claude plugin install filip-skills@filip-skills
```

For local development:

```bash
claude plugin marketplace add /Users/filip/Developer/projects/github.com/FilipKrawiec/skills
claude plugin install filip-skills@filip-skills
```

## Codex

Codex plugin metadata lives in `.codex-plugin/plugin.json` and uses the same root `skills/` directory.

## Antigravity (`agy`)

Antigravity plugin metadata lives in `plugin.json` at the root of the repository, using the `skills/` directory natively.

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

