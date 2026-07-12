# Agent Guidance

## SDLC Required for Changes

Before making any repository code or configuration change, invoke the `sdlc` workflow. This includes changes to agent instructions, skills, plugin manifests, scripts, and tests. Read-only analysis and explicitly requested plan-only work are exempt.

## Mandatory Skill Editing Workflow

CRITICAL: You are strictly forbidden from making any edits to the packaged skill directories until you have read `plugins/authoring/skills/writing-great-skill/SKILL.md`. Furthermore, you MUST execute all edits through the `` `sdlc` `` workflow. Treat `writing-great-skill` as the local source of truth for invocation, description craft, information hierarchy, and pruning.

## Goal

Keep this repository as a compact, agent-agnostic skill library.

## Layout

- `plugins/*/skills/` for canonical skill implementations grouped by plugin
- `docs/` for ADRs and durable project records

## Editing Rules

- Update the relevant skill and its references together.
- Move content rather than duplicating it when a concept belongs in `references/`.
- Run `python3 scripts/validate-plugin-definitions.py` after changing skills or plugin manifests.
- Preserve existing user changes outside the requested scope.

## Shipping

- For now, skip feature branches during SHIP: once the SHIP phase is finished and the user approves shipping, commit directly to `main`.
