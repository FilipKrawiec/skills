# Repository Concepts & Architecture Guide

This document provides a comprehensive guide to the architectural design, core concepts, and operational models used throughout the `skills` repository.

---

## 1. Core Philosophy & Principles

The `skills` repository is designed around six foundational principles:

1. **Provider Neutrality & Sovereign Git Distribution**: Skill instructions and verification contracts do not depend on third-party SaaS registries. They work seamlessly via standard Git checkout across Codex, Claude Code, Antigravity (`agy`), and local LLMs.
2. **Affirmative State Machines**: Skills structure instructions as unidirectional linear phases with positive actions and concrete exit gates. Negative "Do/Don't" phrasing is eliminated to prevent negative prompt priming.
3. **Output Token Economics & Explicit Envelopes**: Output generation tokens are 3×–5× more expensive than input context. Skills enforce explicit compact output templates, high-density communication, and code anti-overengineering (Rule of Two Adapters).
4. **Dual-Speed Flow Topology**: The library provides a Fast Tactical Loop (`tdd` ➔ `review` ➔ `vcs`) for immediate defect resolution alongside the Enterprise Delivery Loop (`define` ➔ `specify` ➔ `deliver`) for multi-agent worktrees.
5. **Deterministic Verification**: AI agents validate all work against deterministic verification gates defined in `AGENTS.md` and executed via `scripts/project-verify.py`.
6. **Hierarchical Overlay Architecture**: Base capabilities are defined in common, provider-neutral plugins (`plugins/common/*`), while agent-specific enhancements (such as Antigravity interactive artifacts) are layered on top via native overlays (`plugins/agy/*`).

---

## 2. Skill Architecture & Design

A **skill** is a compact, reusable package of instructions, scripts, and context pointers that guide an AI agent when performing specialized software engineering tasks.

```
plugins/common/<package>/skills/<skill-name>/
├── SKILL.md                 # Primary instruction entrypoint with frontmatter
├── references/              # Context pointers loaded on-demand (<300 lines)
│   └── domain-details.md
├── scripts/                 # Non-interactive CLI helper tools
└── assets/                  # Templates, boilerplate, or visual assets
```

### Key Components of a Skill

* **YAML Frontmatter**: Defines the skill's identity, trigger, and invocation type.
  ```yaml
  ---
  name: ddd
  description: Use when defining a business domain's language, contexts and maps, aggregates, entities, value objects, repositories, domain events, or strategic design.
  ---
  ```
  For human-triggered workflows, add `disable-model-invocation: true`.
* **Description Craft**: Descriptions reside in the agent's startup context. They must begin with `"Use when..."`, focus on user intent, and specify clear trigger boundaries under 1024 characters.
* **Affirmative Phase Sequencing**: Steps are organized into sequential numbered phases, each pairing a single affirmative action with an observable exit gate (such as a command exit code 0 or diff block).
* **Explicit Output Envelopes**: Every phase defines the exact compact Markdown template the agent should emit, preventing conversational wandering.
* **Universal ASCII Diagram Standard**: Uses clean ASCII/Unicode box diagrams and Markdown tables; Mermaid code blocks are prohibited to guarantee rendering across all editor environments.
* **On-Demand Doctrine Chaining**: Flow skills (`tdd`, `review`) invoke Doctrine skills (`ddd`, `hexagonal-architecture`) via native `Skill` tool calls on demand, preventing startup context clutter.

---

## 3. Plugin Packaging & Overlay System

Skills are grouped into **plugins** for distribution and host discovery.

```
plugins/
├── common/                  # Canonical portable plugins (Cross-Agent)
│   ├── core/                # DDD, Hexagonal Architecture
│   ├── workflow/            # TDD, Review, VCS, Grill with Context, Issue Lanes, AFK
│   └── authoring/           # Writing Great Skill
└── agy/                     # Antigravity-Native Overlay Plugins
    └── core/                # Reference resolution & interactive artifact review rules
```

The SDLC skills (`define`, `specify`, `deliver`) ship in the `filipkrawiec-sdlc` package of FilipKrawiec/devcontainer.

### Common vs. Overlay Plugins

* **Common Plugins (`plugins/common/*`)**: Fully portable skills formatted in standard YAML and Markdown. They run on any host harness (Claude Code, Codex, Antigravity, custom agents) without requiring host-specific code.
* **Agent Overlays (`plugins/<agent>/*`)**: Progressive enhancements tailored to specific host capabilities. For example, `plugins/agy/` overlays Antigravity-native Artifact workflows with interactive UI review buttons.

---

## 4. Delivery Orchestration & Task Packets

Attended, multi-slice delivery uses the `deliver` workflow of the `filipkrawiec-sdlc` package (FilipKrawiec/devcontainer), which guides changes through a bounded 7-stage lifecycle. Unattended, single-issue delivery uses issue lanes (next section).

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

1. **DEFINE**: Capture business goals, non-goals, constraints, and scope boundaries. Record findings by creating the tracker item (`gh issue create`) on the Backlog.
2. **SPECIFY / GRILL**: Challenge requirements against existing code and repository context. Resolve contradictions early and update the tracker item with acceptance criteria.
3. **PLAN**: Break work down into minimal, cohesive delivery slices, prepare task packets (`version: 2`), and present `implementation_plan.md` with interactive feedback request (`RequestFeedback: true`). Wait for user **Proceed** approval.
4. **DISPATCH**: Create dedicated Git worktrees and short-lived task branches (`task/<name>`) for each slice, routing execution to suitable harnesses.
5. **COLLECT / VERIFY**: Gather evidence, test results, and change summaries from executors into `walkthrough.md`. Run deterministic verification gates.
6. **REVIEW**: Audit outcomes against task acceptance criteria and verification gates, logging findings in `walkthrough.md`.
7. **SHIP / RETURN**: Link the Delivery Record, publish the **Review Request** artifact on the task branch, and present the work for user merge approval. Never commit directly to or merge protected default branches (`main`).

### Worktree Provenance & Safety

Whenever a new worktree is created or new work is started, the original main branch must be updated first (e.g. `git fetch origin main:main` or pulling latest upstream changes). Every orchestrated task slice executes inside an isolated Git worktree branched from this declared, updated base revision. This guarantees that:
* Primary checkouts remain protected from unverified edits.
* Multiple non-overlapping tasks can run concurrently in total isolation.
* Unintended side effects are caught at packet boundaries.

### Issue Lanes & AFK Delivery

`issue-lanes` and `afk` turn a repository's GitHub Issues into one queue that runs while the owner is away. A repository opts in with `.github/lanes.json`.

| Lane | Meaning | Applied by |
| :--- | :--- | :--- |
| `lane:afk` | Deliver unattended | The owner, or an agent the owner just said yes to |
| `lane:proposed` | Agent recommends AFK | `issue-lanes` triage |
| `lane:owner` | Needs a decision, credentials, settings or a device | Anyone |

An `afk` run delivers at most one eligible issue (acceptance criteria, a `scope` packet, closed dependencies) in its own worktree, checks its diff against the packet, and opens a PR, or parks the issue back to `lane:owner` with one question. Docs, tests and Dependabot dependency PRs auto-merge on green checks; everything else waits for the owner. The workflow plugin's pre-tool-use guard (`skills/afk/scripts/guard.py`, on hosts that load plugin hooks) blocks agent merges, releases, workflow dispatch and settings changes, and blocks `lane:afk` in scheduled runs.

---

## 5. Deterministic Verification Loop

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
