# Agent Guidance

## Mandatory Skill Editing Workflow

CRITICAL: You are strictly forbidden from making any edits to the `skills/` directory until you have read `skills/writing-great-skill/SKILL.md`. Furthermore, you MUST execute all edits through the `` `sdlc` `` workflow. Treat `writing-great-skill` as the local source of truth for invocation, description craft, information hierarchy, and pruning.

## Goal

Keep this repository as a compact, agent-agnostic skill library.

## Layout

- `skills/` for canonical skill implementations
- `docs/` for ADRs and durable project records

## Editing Rules

- Update the relevant skill and its references together.
- Move content rather than duplicating it when a concept belongs in `references/`.
- Run `python3 scripts/validate-plugin-definitions.py` after changing skills or plugin manifests.
- Preserve existing user changes outside the requested scope.
