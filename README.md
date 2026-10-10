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
 └─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                            PORTABLE SKILLS                                  │
 │   Core:         ddd, hexagonal-architecture                                 │
 │   Workflow:     spec, refine, plan, tdd, vcs, review, ship, improve,          │
 │                 afk, agent-review                                           │
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
             ▼ (Fast Tactical Loop)                                ▼ (Delivery Cycle)
  ┌──────────────────────────────┐                      ┌──────────────────────────────┐
  │ 1. tdd (Repro & Red-Green)   │                      │ 01+02 spec                   │
  │ 2. review (Smell & Spec)     │                      │ 03 plan     04 tdd + vcs     │
  │ 3. vcs (Atomic commit)       │                      │ 05 review   06 ship          │
  └──────────────┬───────────────┘                      │ 07 improve  (afk runs 03-07) │
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

* **System-Prompt Style under Word Budgets**: Skills are direct orders in numbered phases with checkable exit gates; the validator caps each `SKILL.md` at 800 words and each reference at 600.
* **Zero-Waste Output Economics**: Every skill phase defines explicit output envelopes, high-density token efficiency, and code anti-overengineering (Rule of Two Adapters).
* **Provider-Neutral & Sovereign Git-Native**: Pure Git clone/submodule distribution across harnesses (Claude Code, Codex, Antigravity) without SaaS registry dependencies.
* **Delivery Cycle**: Seven phases (01 Define to 07 Improve), one skill each, on an optional Project board (epics only in an Epics view, every other issue in a Board view) with standard columns that GitHub's built-in workflows mostly move.
* **Issue Lanes & AFK Delivery**: `spec` gives every GitHub issue one lane (`lane:afk`, `lane:proposed`, `lane:owner`); `afk` carries owner-approved issues through plan, execute, review, ship and improve unattended, one at a time, while GitHub branch protection, CODEOWNERS and two machine users keep merges, releases and settings with the owner.
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
| | [`spec`](plugins/common/workflow/skills/spec/SKILL.md) | Model | 01 Define, 02 Spec: Open the issue, grill against project context, write acceptance criteria, decide the lane (with an estimate and scope packet for AFK). |
| | [`refine`](plugins/common/workflow/skills/refine/SKILL.md) | Model | Refine a backlog or project board: reconcile decisions, dependencies, scope and readiness across items. |
| | [`plan`](plugins/common/workflow/skills/plan/SKILL.md) | Model | 03 Plan: Post a repository-grounded plan on the issue; owner approval only for a UX, cost or best-practice decision. |
| | [`ship`](plugins/common/workflow/skills/ship/SKILL.md) | Model | 06 Ship: Base-branch health after merge, revert AFK breakage, confirm shipped issues. |
| | [`improve`](plugins/common/workflow/skills/improve/SKILL.md) | Model | 07 Improve: Turn a failure seen twice into a lesson PR for skills, agent rules, docs or assets. |
| | [`afk`](plugins/common/workflow/skills/afk/SKILL.md) | User (scheduler invokes by name) | Unattended Delivery: Runs the cycle for one approved issue per run, park-with-a-question, squash auto-merge, housekeeping. |
| | [`agent-review`](plugins/common/workflow/skills/agent-review/SKILL.md) | User (scheduler invokes by name) | Agent Review: Review each open PR per head commit, hand critical PRs to the owner, merge reviewed AFK PRs, wake the runner. |
| **`filipkrawiec-authoring`** | [`writing-great-skill`](plugins/common/authoring/skills/writing-great-skill/SKILL.md) | Model | Meta-Skill: Authoring skills as system-prompt orders within word budgets. |

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

*Tip*: `just refresh` reinstalls the released packages from the marketplace (Codex, Claude, and Antigravity IDE); `--plugin-dir` and `just link-agy` are the paths that load this checkout.

### Codex

Register the repository checkout as a local marketplace:

```bash
codex plugin marketplace add .
codex plugin add filipkrawiec-core@filipkrawiec
codex plugin add filipkrawiec-workflow@filipkrawiec
codex plugin add filipkrawiec-authoring@filipkrawiec
```

### Antigravity (`agy`)

Link the common packages directly into Antigravity IDE:

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
just verify       # unit tests plus the validator; python3 scripts/project-verify.py verify runs the validator and git hygiene only

# Run release version validator
just release-check

# Refresh locally installed plugins after a release
just refresh
```

---

## 🤝 Contributing & Maintainer Workflows

Want to add a new skill, update plugin manifests, or prepare a release tag? Read our full [Contributing & Maintenance Guide](CONTRIBUTING.md).

### Release Procedure Summary

* **Pre-merge**: Run `just verify` and open a pull request. This stage does not claim a release tag, published version, or completed release.
* **Release**: merging to `main` releases. Once `verify.yml` passes, `.github/workflows/release.yml` computes the semver bump from conventional commits, synchronizes all plugin manifests, commits, tags `v<version>`, pushes the commit and tag atomically past branch protection with the admin `RELEASE_TOKEN` secret, and publishes the GitHub Release.

---

## 📄 License & Public Mandate

This repository is **public**. Do not add proprietary, client, or secret material to skills or plugin packages.
