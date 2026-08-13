# Repository Concepts & Architecture Guide

This document provides a comprehensive guide to the architectural design, core concepts, and operational models used throughout the `skills` repository.

---

## 1. Core Philosophy & Principles

The `skills` repository is designed around four foundational principles:

1. **Provider Neutrality**: Skill instructions, knowledge bases, and verification contracts do not lock you into any single AI provider or host harness. They work seamlessly across Codex, Claude Code, Antigravity (`agy`), and local LLM runners.
2. **Single Source of Truth**: Every domain concept, architectural rule, and instruction has a canonical location. Duplication across skills or documentation is avoided by delegating details to `references/` or `knowledge/`.
3. **Deterministic Verification**: AI agents should never rely on subjective self-assessment to claim completion. All changes are validated against deterministic verification gates defined in `AGENTS.md` and executed via `scripts/project-verify.py`.
4. **Hierarchical Overlay Architecture**: Base capabilities are defined in common, provider-neutral plugins, while agent-specific user experience enhancements (such as Antigravity interactive artifacts) are layered on top via native overlays.

---

## 2. Skill Architecture & Design

A **skill** is a compact, reusable package of instructions, scripts, and context pointers that guide an AI agent when performing specialized software engineering tasks.

```
plugins/common/<package>/skills/<skill-name>/
├── SKILL.md                 # Primary instruction entrypoint with frontmatter
├── references/              # Context pointers loaded on-demand
│   └── domain-details.md
├── scripts/                 # Non-interactive CLI helper tools
└── assets/                  # Templates, boilerplate, or visual assets
```

### Key Components of a Skill

* **YAML Frontmatter**: Defines the skill's identity and invocation trigger.
  ```yaml
  ---
  name: ddd
  description: Use when defining a business domain's language, contexts and maps, aggregates, entities, value objects, repositories, domain events, or strategic design.
  ---
  ```
* **Description Craft**: Descriptions reside in the agent's startup context. They must begin with `"Use when..."`, focus on user intent rather than internal mechanics, and specify precise trigger boundaries to prevent false activations.
* **Information Hierarchy**:
  * `SKILL.md` contains only the core workflow steps and essential rules.
  * Deep domain reference material lives in relative markdown files inside `references/` and is referenced via **context pointers** (e.g., *"Read `[ubiquitous-language.md](references/ubiquitous-language.md)` when defining domain terminology."*).

---

## 3. Plugin Packaging & Overlay System

Skills are grouped into **plugins** for distribution and host discovery.

```
plugins/
├── common/                  # Canonical portable plugins (Cross-Agent)
│   ├── core/                # DDD, Hexagonal Architecture
│   ├── workflow/            # TDD, VCS, Grill with Docs
│   ├── orchestration/       # Delivery Orchestration, Monorepo Scaffolding
│   └── authoring/           # Writing Great Skills, Teach
└── agy/                     # Antigravity-Native Overlay Plugins
    ├── core/                # Interactive UI review overlays
    └── orchestration/       # Artifact UI proceed buttons & state trackers
```

### Common vs. Overlay Plugins

* **Common Plugins (`plugins/common/*`)**: Fully portable skills formatted in standard YAML and Markdown. They run on any host harness (Claude Code, Codex, Antigravity, custom agents) without requiring host-specific code.
* **Agent Overlays (`plugins/<agent>/*`)**: Progressive enhancements tailored to specific host capabilities. For example, `plugins/agy/` overlays Antigravity-native Artifact workflows with interactive UI review buttons.

---

## 4. Delivery Orchestration & Task Packets

Delivery is managed through the provider-neutral `orchestrate-delivery` workflow, which guides changes through a bounded 7-stage lifecycle.

```
   ┌──────────┐      ┌───────────────┐      ┌──────────┐      ┌────────────┐
   │  DEFINE  │ ───► │ SPECIFY/GRILL │ ───► │   PLAN   │ ───► │  DISPATCH  │
   └──────────┘      └───────────────┘      └──────────┘      └────────────┘
                                                                     │
   ┌─────────────┐      ┌────────────┐      ┌────────────────┐       │
   │ SHIP/RETURN │ ◄─── │   REVIEW   │ ◄─── │ COLLECT/VERIFY │ ◄─────┘
   └─────────────┘      └────────────┘      └────────────────┘
```

### The 7 Delivery Stages & Native Artifact Tracking

1. **DEFINE**: Capture business goals, non-goals, constraints, and scope boundaries. Record findings in `implementation_plan.md`.
2. **SPECIFY / GRILL**: Challenge requirements against existing code and knowledge base entries. Resolve contradictions early and update `implementation_plan.md`.
3. **PLAN**: Break work down into minimal, cohesive delivery slices, prepare task packets (`version: 2`), and present `implementation_plan.md` with interactive feedback request (`RequestFeedback: true`). Wait for user **Proceed** approval.
4. **DISPATCH**: Create dedicated Git worktrees and short-lived task branches (`task/<name>`) for each slice, routing execution to suitable harnesses.
5. **COLLECT / VERIFY**: Gather evidence, test results, and change summaries from executors into `walkthrough.md`. Run deterministic verification gates.
6. **REVIEW**: Audit outcomes against task acceptance criteria and verification gates, logging findings in `walkthrough.md`.
7. **SHIP / RETURN**: Link the Delivery Record, publish the **Review Request** artifact on the task branch, and present the work for user merge approval. Never commit directly to or merge protected default branches (`main`).


### Worktree Provenance & Safety

Every orchestrated task slice executes inside an isolated Git worktree branched from a declared base revision. This guarantees that:
* Primary checkouts remain protected from unverified edits.
* Multiple non-overlapping tasks can run concurrently in total isolation.
* Unintended side effects are caught at packet boundaries.

---

## 5. Central & Project Knowledge System

The repository defines a structured **Knowledge Base** framework that provides agents with deterministic guidance, patterns, and verification checks.

### Knowledge Categories

Central Knowledge is structured into seven distinct categories:

| Category | Kind | Purpose |
| :--- | :--- | :--- |
| `doctrines/` | `doctrine` | Non-negotiable architectural and engineering mandates. |
| `glossary/` | `glossary` | Ubiquitous language definitions across domain boundaries. |
| `preferences/` | `preference` | Coding style, library, and tool choices. |
| `technology-profiles/` | `technology-profile` | Stack definitions and native verification checks. |
| `templates/` | `template` | Boilerplate structures for specs, code, or configs. |
| `examples/` | `example` | Reference implementations and usage patterns. |
| `config-artifacts/` | `config-artifact` | Standardized environment and tooling configurations. |

### Sparse Project Knowledge

Target repositories initialize a lightweight `.project-knowledge/` directory using `python3 scripts/project-verify.py project-init`. This creates a sparse overlay allowing local project rules and active technology profile choices (`project-profiles.yaml`) to override or extend Central Knowledge.

---

## 6. Deterministic Verification Loop

Agents verify their work using deterministic project checks rather than guesswork.

```
AGENTS.md (Frontmatter) ──► project-verify.py ──► Build Tool / Test Suite
```

### `AGENTS.md` Frontmatter Contract

Project roots declare active skills and deterministic build tasks inside `AGENTS.md` frontmatter:

```yaml
---
active_skills:
  - ddd
  - hexagonal-architecture
  - tdd

build_tools:
  python:
    build_script: scripts/validate-plugin-definitions.py
    lifecycle_tasks:
      unit: python3 -m unittest discover -s scripts/tests
      verify: python3 scripts/validate-plugin-definitions.py
---
```

Executing `python3 scripts/project-verify.py verify` reads this frontmatter, resolves the appropriate build tool, executes the deterministic verification command, and checks Git worktree hygiene.
