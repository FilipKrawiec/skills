# Repository Concepts & Architecture Guide

This document provides a comprehensive guide to the architectural design, core concepts, and operational models used throughout the `skills` repository.

---

## 1. Core Philosophy & Principles

The `skills` repository is designed around six foundational principles:

1. **Provider Neutrality & Sovereign Git Distribution**: Skill instructions and verification contracts do not depend on third-party SaaS registries. They work seamlessly via standard Git checkout across Codex, Claude Code, Antigravity (`agy`), and local LLMs.
2. **Affirmative State Machines**: Skills structure instructions as unidirectional linear phases with positive actions and concrete exit gates. Negative "Do/Don't" phrasing is eliminated to prevent negative prompt priming.
3. **Output Token Economics & Explicit Envelopes**: Output generation tokens are 3×–5× more expensive than input context. Skills enforce explicit compact output templates, high-density communication, and code anti-overengineering (Rule of Two Adapters).
4. **Dual-Speed Flow Topology**: The library provides a Fast Tactical Loop (`tdd` ➔ `review` ➔ `vcs`) for direct changes alongside the Delivery Cycle (`define` ➔ `spec` ➔ `plan` ➔ `tdd` ➔ `review` ➔ `ship` ➔ `improve`) for tracked work, attended or AFK.
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
│   ├── workflow/            # The delivery cycle: define, spec, plan, tdd, vcs, review, ship, improve, afk, agent-review
│   └── authoring/           # Writing Great Skill
└── agy/                     # Antigravity-Native Overlay Plugins
    └── core/                # Reference resolution & interactive artifact review rules
```

### Common vs. Overlay Plugins

* **Common Plugins (`plugins/common/*`)**: Fully portable skills formatted in standard YAML and Markdown. They run on any host harness (Claude Code, Codex, Antigravity, custom agents) without requiring host-specific code.
* **Agent Overlays (`plugins/<agent>/*`)**: Progressive enhancements tailored to specific host capabilities. For example, `plugins/agy/` overlays Antigravity-native Artifact workflows with interactive UI review buttons.

---

## 4. The Delivery Cycle

Delivery follows seven phases. Each one has a skill, and each is a column on the optional Project board. The skill that finishes a phase moves the card, so the board shows which phase every issue is in.

```
 ┌───────────┐   ┌─────────┐   ┌─────────┐   ┌────────────┐
 │ 01 Define │──►│ 02 Spec │──►│ 03 Plan │──►│ 04 Execute │
 │  define   │   │  spec   │   │  plan   │   │ tdd + vcs  │
 └───────────┘   └─────────┘   └─────────┘   └─────┬──────┘
       ▲                                           ▼
 ┌─────┴──────┐   ┌──────────┐   ┌─────────────────────────┐
 │ 07 Improve │◄──│ 06 Ship  │◄──│        05 Review        │
 │  improve   │   │   ship   │   │ review, agent-review    │
 └────────────┘   └──────────┘   └─────────────────────────┘
```

| Phase | Skill | Leaves behind |
| :--- | :--- | :--- |
| 01 Define | `define` | An issue with intent and open questions |
| 02 Spec | `spec` | Acceptance criteria, non-goals, estimate, scope packet, one lane |
| 03 Plan | `plan` | A `## Plan` comment on the issue |
| 04 Execute | `tdd`, `vcs` | Tested commits on a task branch |
| 05 Review | `review` (fresh-context worker), `agent-review` | A PR with a verdict |
| 06 Ship | `ship` | A green base branch, a revert PR, or an escalation |
| 07 Improve | `improve` | A `## Lessons` comment and an issue per accepted lesson |

The board column is the phase. `plugins/common/workflow/references/board.md` is the one source for when an issue is in each column, which skill works it, and the `gh project` commands that move the card. Lanes stay labels, so a card's labels show who acts next. `lanes.py` keeps only the gates an agent must not judge for itself (`next`, `scope`, `automerge`, `merge-reviewed`); claiming, parking and tidying are plain `gh` and `git` steps in the same reference.

### Worktree Provenance & Safety

Whenever a new worktree is created or new work is started, the original main branch must be updated first (e.g. `git fetch origin main:main` or pulling latest upstream changes). Every task executes inside an isolated Git worktree branched from this declared, updated base revision, so primary checkouts stay protected from unverified edits and non-overlapping tasks can run concurrently.

### Issue Lanes & AFK Delivery

GitHub Issues are the only queue. A repository opts in with `.github/lanes.json`.

| Lane | Meaning | Applied by |
| :--- | :--- | :--- |
| `lane:afk` | Deliver unattended | The owner, or an agent the owner just said yes to |
| `lane:proposed` | Agent recommends AFK | `spec` triage |
| `lane:owner` | Needs a decision, credentials, settings or a device | Anyone |

An `afk` run carries the cycle while the owner is away. It first invokes `ship`, which checks the base branch, opens a revert PR when an AFK merge turned it red, and confirms shipped issues. Then it tends its own PRs. It takes at most one eligible issue (acceptance criteria, a `scope` packet, closed dependencies) through `plan`, `tdd` and a fresh-context `review`, and opens a PR, or parks the issue back to `lane:owner` with one question. It ends by invoking `improve`, which proposes lessons. Docs, tests and Dependabot dependency PRs auto-merge on green checks; everything else waits for the owner. The workflow plugin's pre-tool-use guard (`skills/afk/scripts/guard.py`, on hosts that load plugin hooks) blocks agent merges, releases, workflow dispatch and settings changes, and blocks `lane:afk` in scheduled runs. Runs never touch the checkout they start in: queue decisions read the fetched base branch.

With `agentReview` in lanes.json, `agent-review` reviews every open PR once per head commit, the runner fixes its findings for up to `reviewRounds` rounds, and `lanes.py merge-reviewed` merges an AFK PR the reviewer judged ready and not critical; critical PRs go to the owner with `review:owner`.

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
