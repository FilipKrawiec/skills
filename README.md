# Skills Repository

> **Portable AI Agent Skills, Architectural Doctrines & Local Plugin Ecosystem**

Welcome to the **Skills Repository**—a public, provider-neutral library of software engineering skills, domain-driven architecture doctrines, delivery orchestration workflows, and plugin packages designed for AI pair programmers and autonomous coding agents.

This repository works out of the box with **Claude Code**, **Codex**, **Antigravity (`agy`)**, and any AI agent framework that supports structured YAML/Markdown skills.

---

## 🗺️ System Architecture & Mental Model

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         HOST AGENTS & HARNESSES                             │
 │           Claude Code  │  Codex  │  Antigravity (agy)  │  Custom            │
 └─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                            PLUGIN ECOSYSTEM                                 │
 │  plugins/common/*   Canonical Portable Plugins (Cross-Agent)                 │
 │  plugins/agy/*      Antigravity-Native UI & Artifact Overlays               │
 └─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                            PORTABLE SKILLS                                  │
 │   Core:         ddd, hexagonal-architecture                                 │
 │   Workflow:     tdd, vcs, triage, review, grill-with-context                 │
 │   SDLC:         deliver, scaffold-monorepo, define, specify, improve         │
 │   Authoring:    writing-great-skill, guide, rephrase, swot, teach           │
 └─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                      KNOWLEDGE BASE & VERIFICATION                          │
 │   Central Knowledge:  Doctrines, Glossary, Tech Profiles, Preferences       │
 │   Project Knowledge:  .project-knowledge/ (Sparse local overrides)          │
 │   Verifier CLI:       scripts/project-verify.py                              │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Dual-Speed Flow Topology

This library supports two complementary execution loops depending on the scope of work:

```
                         ┌──────────────────────────────┐
                         │   INCOMING TASK / PROBLEM    │
                         └──────────────┬───────────────┘
                                        │
                               ┌────────▼────────┐
                               │  guide (Router) │
                               └────────┬────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │                                                     │
             ▼ (Fast Tactical Loop)                                ▼ (Enterprise Delivery Loop)
  ┌──────────────────────────────┐                      ┌──────────────────────────────┐
  │ 1. triage (Red signal & cut) │                      │ 1. define (Outcomes & Scope) │
  │ 2. tdd (Chicago Red-Green)   │                      │ 2. specify/grill-with-context│
  │ 3. review (Smell & Spec)     │                      │ 3. deliver                   │
  │ 4. vcs (Atomic commit)       │                      │    (Worktree multi-agent)    │
  └──────────────┬───────────────┘                      │ 4. project-verify.py (Gates) │
                 │                                      │ 5. Review Request & Ship     │
                 │                                      └──────────────┬───────────────┘
                 │                                                     │
                 └──────────────────────┬──────────────────────────────┘
                                        ▼
                   ┌────────────────────────────────────────┐
                   │    ARCHITECTURAL DOCTRINES (ON DEMAND) │
                   │  • ddd (Aggregates, Events, Terms)     │
                   │  • hexagonal-architecture (Ports)      │
                   └────────────────────────────────────────┘
```

---

## 💡 Core Concepts at a Glance

For full details, read the comprehensive [Concepts & Architecture Guide](docs/CONCEPTS.md).

* **Affirmative State Machines**: Skills are structured as unidirectional linear phases with explicit affirmative actions and concrete exit gates, eliminating negative prompt priming ("Do vs Don't" contradictions).
* **Zero-Waste Output Economics**: Every skill phase defines explicit output envelopes, high-density token efficiency, and code anti-overengineering (Rule of Two Adapters).
* **Provider-Neutral & Sovereign Git-Native**: Pure Git clone/submodule distribution across harnesses (Claude Code, Codex, Antigravity) without SaaS registry dependencies.
* **Delivery Orchestration**: The `deliver` workflow coordinates bounded project changes across isolated Git worktrees.
* **Deterministic Verification**: `scripts/project-verify.py` acts as a zero-dependency, deterministic gate for code verification and git hygiene.

---

## 📦 Installed Skills Catalogue

| Package | Skill Name | Invocation | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **`filipkrawiec-core`** | [`ddd`](plugins/common/core/skills/ddd/SKILL.md) | Model | Domain-Driven Design: Ubiquitous language, strategic mapping, and aggregates. |
| | [`hexagonal-architecture`](plugins/common/core/skills/hexagonal-architecture/SKILL.md) | Model | Ports & Adapters: 4-layer architecture (API, App, Domain, Infra) & encapsulation. |
| **`filipkrawiec-workflow`** | [`triage`](plugins/common/workflow/skills/triage/SKILL.md) | Model | Root-Cause Debugging: 5-phase scientific defect reproduction and verification loop. |
| | [`tdd`](plugins/common/workflow/skills/tdd/SKILL.md) | Model | Test-Driven Development: Chicago-school Red-Green-Refactor with doctrine chaining. |
| | [`review`](plugins/common/workflow/skills/review/SKILL.md) | Model | 2-Axis Diff Audit: Fowler code smells, hexagonal boundaries, and spec compliance. |
| | [`vcs`](plugins/common/workflow/skills/vcs/SKILL.md) | Model | Version Control: Conventional commits, worktree isolation, and PR delivery. |
| | [`grill-with-context`](plugins/common/workflow/skills/grill-with-context/SKILL.md) | Model | Context Grilling: Ground specifications against ADRs, glossary, and knowledge. |
| **`filipkrawiec-sdlc`** | [`deliver`](plugins/common/sdlc/skills/deliver/SKILL.md) | User | Delivery Flow: Provider-neutral, code-free task orchestration & worktrees. |
| | [`define`](plugins/common/sdlc/skills/define/SKILL.md) | User | Intent Definition: Capture outcomes, scope boundaries, and issue tracker payload. |
| | [`specify`](plugins/common/sdlc/skills/specify/SKILL.md) | User | Backlog Refinement: Interactive grilling and tracker specification refinement. |
| | [`scaffold-monorepo`](plugins/common/sdlc/skills/scaffold-monorepo/SKILL.md) | User | Repository Scaffolding: Trunk-based monorepo layout with `.devcontainer` and `justfile`. |
| | [`improve`](plugins/common/sdlc/skills/improve/SKILL.md) | Model | Retrospective Learner: Capture friction and log upstream skill improvements. |
| **`filipkrawiec-authoring`** | [`guide`](plugins/common/authoring/skills/guide/SKILL.md) | User | Workflow Router: Navigate developer intent to the optimal workflow path. |
| | [`rephrase`](plugins/common/authoring/skills/rephrase/SKILL.md) | User | Alignment Reset: Restate complex proposals in plain Technical English. |
| | [`writing-great-skill`](plugins/common/authoring/skills/writing-great-skill/SKILL.md) | Model | Meta-Skill: Authoring affirmative state machines, output contracts, and token budgets. |
| | [`swot`](plugins/common/authoring/skills/swot/SKILL.md) | User | Strategic Audit: Evidence-grounded SWOT analysis and architectural health audits. |
| | [`teach`](plugins/common/authoring/skills/teach/SKILL.md) | User | Education: Interactive learning guides and architectural trade-off walkthroughs. |

---

## 🚀 Local Developer & Agent Setup

### Claude Code

Run Claude Code with common plugin packages directly:

```bash
claude \
  --plugin-dir plugins/common/core \
  --plugin-dir plugins/common/workflow \
  --plugin-dir plugins/common/sdlc \
  --plugin-dir plugins/common/authoring
```

*Tip*: Run `just refresh` to update all local plugin installations (Codex, Claude, and Antigravity IDE).

### Codex

Register the repository checkout as a local marketplace:

```bash
codex plugin marketplace add .
codex plugin add filipkrawiec-core@filipkrawiec
codex plugin add filipkrawiec-workflow@filipkrawiec
codex plugin add filipkrawiec-sdlc@filipkrawiec
codex plugin add filipkrawiec-authoring@filipkrawiec
```

### Antigravity (`agy`)

Link common packages and native overlays directly into Antigravity IDE:

```bash
just link-agy
```

This creates live symlinks to your checkout so changes take effect immediately upon restarting Antigravity.

---

## 🛠️ Project Verification & Knowledge Setup

### 1. Initialize Project Knowledge

To equip your target software project with sparse Project Knowledge and validation manifests:

```bash
python3 scripts/project-verify.py project-init --root /path/to/your/project
```

This creates `.project-knowledge/`, `docs/adr/`, and `.project-knowledge/project-profiles.yaml`.

### 2. Run Deterministic Verification

Agents and developers execute project verification tasks defined in `justfile` and `AGENTS.md`:

```bash
# Execute unit tests across script tools
just unit         # or: python3 scripts/project-verify.py unit

# Run full project verifier & git hygiene checks
just verify       # or: python3 scripts/project-verify.py verify

# Check Central Knowledge index freshness
just knowledge-check

# Run release version validator
just release-check

# Perform automated semantic release (bumps version, syncs manifests, commits, and tags)
just release      # or: python3 scripts/release.py auto
```

---

## 🤝 Contributing & Maintainer Workflows

Want to add a new skill, update plugin manifests, or prepare a release tag? Read our full [Contributing & Maintenance Guide](CONTRIBUTING.md).

### Release Procedure Summary

* **Pre-merge**: Run the full repository verification suite (`python3 scripts/project-verify.py unit` and `verify`) and submit a Review Request. This stage does not claim a release tag, published version, or completed release.
* **Post-merge / Ship**: Once merged to `main`, execute the automated release workflow (`just release` or `python3 scripts/release.py`) which computes the semver bump from conventional commits, synchronizes all plugin manifests, creates the annotated tag (`v<version>`), and pushes with tags (`git push --follow-tags`).

---

## 📄 License & Public Mandate

This repository is **public**. Do not add proprietary, client, or secret material to skills, plugins, or `knowledge/` entries.
