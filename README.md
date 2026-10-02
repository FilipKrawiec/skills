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
 │   Workflow:     tdd, review, vcs, grill-with-context, issue-lanes, afk,     │
 │                 agent-review                                                │
 │   SDLC:         deliver, define, specify (FilipKrawiec/devcontainer)        │
 │   Authoring:    writing-great-skill                                         │
 └─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                      AGENTS.md & VERIFICATION ENGINE                        │
 │   Declarative Frontmatter: Active Skills, Build Tools, Lifecycle Tasks      │
 │   Deterministic Verifier:  scripts/project-verify.py (Zero Dependencies)    │
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
             ┌──────────────────────────┴──────────────────────────┐
             │                                                     │
             ▼ (Fast Tactical Loop)                                ▼ (Enterprise Delivery Loop)
  ┌──────────────────────────────┐                      ┌──────────────────────────────┐
  │ 1. tdd (Repro & Red-Green)   │                      │ 1. define (Outcomes & Scope) │
  │ 2. review (Smell & Spec)     │                      │ 2. specify/grill-with-context│
  │ 3. vcs (Atomic commit)       │                      │ 3. deliver                   │
  └──────────────┬───────────────┘                      │    (Worktree multi-agent)    │
                 │                                      │ 4. project-verify.py (Gates) │
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
* **Issue Lanes & AFK Delivery**: `issue-lanes` gives every GitHub issue one lane (`lane:afk`, `lane:proposed`, `lane:owner`); `afk` delivers owner-approved issues unattended, one at a time, behind a guard hook that keeps merges, releases and settings with the owner.
* **Delivery Orchestration**: The `deliver` workflow (in the `filipkrawiec-sdlc` package of [FilipKrawiec/devcontainer](https://github.com/FilipKrawiec/devcontainer)) coordinates bounded project changes across isolated Git worktrees.
* **Deterministic Verification**: `scripts/project-verify.py` acts as a zero-dependency, deterministic gate for code verification and git hygiene.

---

## 📦 Installed Skills Catalogue

| Package | Skill Name | Invocation | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **`filipkrawiec-core`** | [`ddd`](plugins/common/core/skills/ddd/SKILL.md) | Model | Domain-Driven Design: Ubiquitous language, strategic mapping, and aggregates. |
| | [`hexagonal-architecture`](plugins/common/core/skills/hexagonal-architecture/SKILL.md) | Model | Ports & Adapters: 4-layer architecture (API, App, Domain, Infra) & encapsulation. |
| **`filipkrawiec-workflow`** | [`tdd`](plugins/common/workflow/skills/tdd/SKILL.md) | Model | Test-Driven Development: Chicago-school Red-Green-Refactor, bug reproduction first, doctrine chaining. |
| | [`review`](plugins/common/workflow/skills/review/SKILL.md) | Model | Diff Audit: Boundary breaches, runtime defects, design smells, and test rigor. |
| | [`vcs`](plugins/common/workflow/skills/vcs/SKILL.md) | Model | Version Control: Conventional commits, worktree isolation, and PR delivery. |
| | [`issue-lanes`](plugins/common/workflow/skills/issue-lanes/SKILL.md) | Model | Issue Lanes: Create and triage issues into AFK, proposed or owner lanes; ask the owner at creation. |
| | [`afk`](plugins/common/workflow/skills/afk/SKILL.md) | Model | Unattended Delivery: One approved issue per run with a posted plan and a fresh-context review, park-with-a-question, chore auto-merge, reverting AFK merges that break the base branch, lessons, housekeeping. |
| | [`agent-review`](plugins/common/workflow/skills/agent-review/SKILL.md) | Model | Agent Review: Review each open PR per head commit, hand critical PRs to the owner, merge reviewed AFK PRs, wake the runner. |
| | [`grill-with-context`](plugins/common/workflow/skills/grill-with-context/SKILL.md) | Model | Context Grilling: Ground specifications against ADRs, glossary, and knowledge. |
| **`filipkrawiec-authoring`** | [`writing-great-skill`](plugins/common/authoring/skills/writing-great-skill/SKILL.md) | Model | Meta-Skill: Authoring affirmative state machines, output contracts, and token budgets. |

---

## 🚀 Local Developer & Agent Setup

### Claude Code

Install released versions from GitHub, so every machine and scheduled run uses the same tagged release:

```bash
claude plugin marketplace add FilipKrawiec/skills
claude plugin install filipkrawiec-core@filipkrawiec
claude plugin install filipkrawiec-workflow@filipkrawiec
claude plugin install filipkrawiec-authoring@filipkrawiec
```

While developing the skills themselves, run Claude Code with the checkout's packages directly:

```bash
claude \
  --plugin-dir plugins/common/core \
  --plugin-dir plugins/common/workflow \
  --plugin-dir plugins/common/authoring
```

*Tip*: Run `just refresh` to update all local plugin installations (Codex, Claude, and Antigravity IDE).

### Codex

Register the repository checkout as a local marketplace:

```bash
codex plugin marketplace add .
codex plugin add filipkrawiec-core@filipkrawiec
codex plugin add filipkrawiec-workflow@filipkrawiec
codex plugin add filipkrawiec-authoring@filipkrawiec
```

### Antigravity (`agy`)

Link common packages and native overlays directly into Antigravity IDE:

```bash
just link-agy
```

This creates live symlinks to your checkout so changes take effect immediately upon restarting Antigravity.

---

## 🛠️ Project Verification & Lifecycle Tasks

Agents and developers execute deterministic project verification tasks defined in `justfile` and `AGENTS.md`:

```bash
# Execute unit tests across script tools
just unit         # or: python3 scripts/project-verify.py unit

# Run full project verifier & git hygiene checks
just verify       # or: python3 scripts/project-verify.py verify

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

This repository is **public**. Do not add proprietary, client, or secret material to skills or plugin packages.
