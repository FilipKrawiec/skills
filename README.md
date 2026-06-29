# skills
Skills for Software engineering

## Layout

- `skills/grill-with-docs` for source-backed review and critique work
- `skills/writing-great-skill` for skill authoring and refinement
- `skills/domain-modeling` for shaping terms, boundaries, and aggregates
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

## Validation

Check Codex and Claude plugin definitions with:

```bash
python3 scripts/validate-plugin-definitions.py
```
