# Agent Guidance

## Verification Required for Changes

Before making any repository code or configuration change, identify the relevant deterministic verification gate and the evidence it will produce. Run the project's verifier when it is configured, plus proportionate repository checks. Read-only analysis and explicitly requested plan-only work are exempt.

`orchestrate-delivery` is the default provider-neutral, code-free orchestration workflow for bounded project changes.

## Mandatory Skill Editing Workflow

CRITICAL: You are strictly forbidden from making any edits to the packaged skill directories until you have read `plugins/common/authoring/skills/writing-great-skill/SKILL.md`. Treat `writing-great-skill` as the local source of truth for invocation, description craft, information hierarchy, and pruning.

## Goal

Keep this repository as a compact, agent-agnostic skill library.

This is a public repository. Do not add proprietary, client, or secret material to its skills or `knowledge/` content.

## Architectural Decisions

`docs/adr/001-provider-neutral-project-verification.md` is the single current ADR baseline. See `docs/adr/README.md`.

## Layout

- `plugins/common/*/skills/`: Canonical portable skill implementations (YAML and Markdown formats for cross-agent compatibility with Codex, Claude, etc.)
- `plugins/<agent>/*/`: Agent-native overlay plugins (e.g., `plugins/agy/` for Antigravity-native Artifact workflows with interactive UI review and Proceed buttons)
- `docs/`: ADRs and durable project records

## Editing Rules

- Update the relevant skill and its references together.
- Move content rather than duplicating it when a concept belongs in `references/`.
- Run `python3 scripts/validate-plugin-definitions.py` after changing skills or plugin manifests.
- Preserve existing user changes outside the requested scope.

## Shipping

- Implement in an isolated task worktree on a short-lived branch. After verification, an executor may push the task branch and open or update a merge request within its packet boundaries; non-AFK work requires that merge request safety boundary.
- The user retains merge authority. Do not merge, approve, or force-push a protected/default branch unless the user explicitly authorizes that action.
