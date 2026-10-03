---
active_skills:
  - ddd
  - hexagonal-architecture
  - tdd
  - vcs
  - review
  - spec
  - plan
  - ship
  - improve
  - writing-great-skill
  - afk
  - agent-review

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

## Deterministic & Proportionate Verification Protocol

Verification must be deterministic, proportionate, and strictly deduplicated:

- **Targeted Feedback During Iteration**: Identify the relevant verification gate before modifying code. Run focused, proportionate checks (e.g. specific test case, targeted validator, or single component suite) during implementation. Do NOT execute full project-wide verification suites before starting work unless reproducing an existing bug or establishing a diagnostic baseline.
- **Completion Gate & Deduplication**: Run the project's configured verifier (`scripts/project-verify.py` or configured task) once upon completing the change to guarantee zero regressions. Never re-run identical full verification suites if code has not changed since the last passing run.
- **Direct Execution Efficiency**: When the user requests a change or fix directly in chat, execute it directly in place with focused testing. Do not trigger multi-agent dispatch cascades, redundant tracker tickets, or speculative planning artifacts unless explicitly requested or handling complex multi-slice architectural work.
- **Exemptions**: Read-only analysis, documentation edits without runnable scripts, and explicitly requested plan-only work are exempt from running verification gates.

## High-Density Output & Token Efficiency Protocol

Output generation tokens are significantly more expensive and slower than input context tokens. Agents must adhere to high-density communication and anti-overengineering invariants:

- **Zero Conversational Preamble**: Jump directly to action, command execution, or verification evidence.
- **Direct Symbol & File Links**: Link to modified paths (e.g. `[filename](file:///path/to/file#L10-L20)`) instead of echoing file bodies in chat.
- **Evidence-First Output**: Emit compact outputs: exact commands executed, terminal exit code status, and concrete decision points.
- **Decisive Tool Execution**: Batch tool calls logically; eliminate redundant exploratory roundtrips.
- **Code Anti-Overengineering**: Enforce the Rule of Two Adapters (an interface once two implementations exist; a port's test fake counts), YAGNI, and Chicago-style state verification over mock combinatorics.

## Universal Diagramming & Formatting Standard

Do not use Mermaid diagrams in skills or documentation files (renders unreliably across editor viewers). Use clean standard ASCII / Unicode box-drawing diagrams and structured Markdown tables.

## Codebase Area Governance & Doctrine Invocations

When performing implementation or review tasks in specific codebase directories, invoke the corresponding foundational doctrine:
- When writing domain logic, entities, or value objects under `domain/`, invoke the `ddd` skill.
- When defining application ports or infrastructure adapters under `infrastructure/` or `api/`, invoke the `hexagonal-architecture` skill.
- When writing tests under `tests/`, invoke the `tdd` skill.

## Mandatory Skill Editing Workflow

CRITICAL: Read `plugins/common/authoring/skills/writing-great-skill/SKILL.md` before any edit to the packaged skill directories. Treat `writing-great-skill` as the local source of truth for invocation, description craft, information hierarchy, output envelopes, and pruning.

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
- Change either board's Status columns, or which issues each board holds, in `plugins/common/workflow/references/board.md` together with FilipKrawiec/devcontainer's `dev issuetracker`, which reads them, in a companion PR.
- Preserve existing user changes outside the requested scope.

## Shipping

- Work happens in an isolated worktree on a short-lived branch made from the fetched base branch; the checkout a session starts in stays as it is. The claim, open-PR and tidy steps are in `plugins/common/workflow/references/board.md`.
- Before opening a PR, run `review` on the branch as two fresh-context workers (axes A and B), fix every blocking finding, and quote the verdict in the PR body.
- Committed changes stay within the issue's scope packet. After verification, an agent pushes the branch and opens or updates the PR that closes the issue (`Closes #<N>`, linking the `## Plan` comment).
- The owner retains merge authority: merging, approving and force-pushing a protected or default branch happen only on the owner's explicit word; `lanes.py automerge` and `merge-reviewed` are that word for chores and agent-reviewed AFK PRs.
