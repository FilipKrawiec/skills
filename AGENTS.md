# Agent Guidance

## Mandatory Skill Editing Workflow

Before creating or revising anything under `skills/`, read `skills/writing-great-skill/SKILL.md` first. Treat it as the local source of truth for invocation, description craft, information hierarchy, and pruning.

Apply the agentskills.io guardrails by default: concise activation text, compact `SKILL.md`, clear context pointers for references, no generic best-practice prose, and one source of truth per meaning.

## Goal

Keep this repository as a compact, agent-agnostic skill library.

## Layout

- `skills/` for canonical skill implementations
- `docs/` for ADRs and durable project records

## Skill Rules

- Keep `SKILL.md` small, specific, and trigger-friendly.
- Put durable vocabulary and long-lived details in `references/`.
- Add product-specific metadata only when the repo needs it.
- Use cross-skill references sparingly, only when they reduce ambiguity.
- Split only when the new skill earns its context or memory cost.

## Writing Great Skill

- Use that skill as the source of truth for invocation, description craft, information hierarchy, and pruning.
- Do not duplicate those rules in another skill; point back to `writing-great-skill` instead.

## agentskills.io Guardrails

- Descriptions are activation text. Keep them concise, intent-focused, and under 1024 characters.
- `SKILL.md` should contain the core instructions needed on every run.
- Move branch-specific details into `references/` only with a clear loading condition.
- Cut content the agent already knows, generic best-practice prose, and repeated meanings.
- Ground new skills in real tasks, corrections, artifacts, or execution traces.

## Editing Rules

- Update the relevant skill and its references together.
- Move content rather than duplicating it when a concept belongs in `references/`.
- Run `python3 scripts/validate-plugin-definitions.py` after changing skills or plugin manifests.
- Preserve existing user changes outside the requested scope.
