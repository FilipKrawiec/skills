---
active_skills:
  - ddd
  - hexagonal-architecture
  - tdd
  - vcs
  - triage
  - review
  - guide
  - rephrase
  - grill-with-context
  - swot
  - teach
  - writing-great-skill

build_tools:
  just:
    build_script: justfile
    lifecycle_tasks:
      unit: python3 -m unittest discover -s scripts/tests
      verify: python3 scripts/validate-plugin-definitions.py
  python:
    build_script: scripts/validate-plugin-definitions.py
    lifecycle_tasks:
      unit: python3 -m unittest discover -s scripts/tests
      verify: python3 scripts/validate-plugin-definitions.py
---

# Agent Guidance

## Verification Required for Changes

Before making any repository code or configuration change, identify the relevant deterministic verification gate and the evidence it will produce. Run the project's verifier when it is configured, plus proportionate repository checks. Read-only analysis and explicitly requested plan-only work are exempt.

## High-Density Output & Token Efficiency Protocol

Output generation tokens are significantly more expensive and slower than input context tokens. Agents must adhere to high-density communication and anti-overengineering invariants:

- **Zero Conversational Preamble**: Jump directly to action, command execution, or verification evidence.
- **Direct Symbol & File Links**: Link to modified paths (e.g. `[filename](file:///path/to/file#L10-L20)`) instead of echoing file bodies in chat.
- **Evidence-First Output**: Emit compact outputs: exact commands executed, terminal exit code status, and concrete decision points.
- **Decisive Tool Execution**: Batch tool calls logically; eliminate redundant exploratory roundtrips.
- **Code Anti-Overengineering**: Enforce the Rule of Two Adapters (no interfaces without >= 2 concrete implementations), YAGNI, and Chicago-style state verification over mock combinatorics.

## Universal Diagramming & Formatting Standard

Do not use Mermaid diagrams in skills or documentation files (renders unreliably across editor viewers). Use clean standard ASCII / Unicode box-drawing diagrams and structured Markdown tables.

## Codebase Area Governance & Doctrine Invocations

When performing implementation or review tasks in specific codebase directories, invoke the corresponding foundational doctrine:
- When writing domain logic, entities, or value objects under `domain/`, invoke the `ddd` skill.
- When defining application ports or infrastructure adapters under `infrastructure/` or `api/`, invoke the `hexagonal-architecture` skill.
- When writing tests under `tests/`, invoke the `tdd` skill.

## Mandatory Skill Editing Workflow

CRITICAL: You are strictly forbidden from making any edits to the packaged skill directories until you have read `plugins/common/authoring/skills/writing-great-skill/SKILL.md`. Treat `writing-great-skill` as the local source of truth for invocation, description craft, information hierarchy, output envelopes, and pruning.

## Goal

Keep this repository as a compact, agent-agnostic skill library.

This is a public repository. Do not add proprietary, client, or secret material to its skills or plugin packages.

## Architectural Decisions

`docs/adr/001-provider-neutral-project-verification.md` is the single current ADR baseline. See `docs/adr/README.md`.
See `docs/CONCEPTS.md` for the core architecture and concept guide.
See `CONTRIBUTING.md` for maintainer and skill authoring workflows.

## Layout

- `plugins/common/*/skills/`: Canonical portable skill implementations (YAML and Markdown formats for cross-agent compatibility with Codex, Claude, etc.)
- `plugins/<agent>/*/`: Agent-native overlay plugins (e.g., `plugins/agy/` for Antigravity-native Artifact workflows with interactive UI review and Proceed buttons)
- `docs/`: Concepts (`docs/CONCEPTS.md`), ADRs (`docs/adr/`), and durable project records

## Editing Rules

- Update the relevant skill and its references together.
- Move content rather than duplicating it when a concept belongs in `references/`.
- Run `python3 scripts/validate-plugin-definitions.py` after changing skills or plugin manifests.
- Preserve existing user changes outside the requested scope.

## Shipping

- Implement in an isolated, clean task worktree on a short-lived branch. The declared base must be an ancestor of `HEAD`; committed changes must remain within the packet's affected-path boundary. After verification, an executor may push the task branch and publish or update a Review Request within its packet boundaries; non-AFK work requires that Review Request safety boundary.
- Once specification and plan are durable, a published Review Request must carry one Delivery Record reference from the configured tracker. Chat-only, local, and unpushed work does not require one.
- The user retains merge authority. Do not merge, approve, or force-push a protected/default branch unless the user explicitly authorizes that action.
