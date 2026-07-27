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
 │   Architecture: ddd, hexagonal-architecture                                 │
 │   Workflow:     tdd, vcs, grill-with-docs                                   │
 │   Delivery:     orchestrate-delivery, scaffold-monorepo                     │
 │   Authoring:    writing-great-skill, teach                                  │
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

## 💡 Core Concepts at a Glance

For full details, read the comprehensive [Concepts & Architecture Guide](docs/CONCEPTS.md).

* **Provider-Neutral Skills**: Modular instruction packages (`SKILL.md`) that guide AI agents through complex software engineering tasks. Skills use lightweight YAML frontmatter and delegate deep context to local `references/`.
* **Common vs. Overlay Plugins**: Base capabilities reside in `plugins/common/*` for cross-agent compatibility. Native overlays in `plugins/<agent>/*` add host-specific user interface features (such as Antigravity interactive artifacts).
* **Delivery Orchestration**: The `orchestrate-delivery` workflow coordinates bounded project changes across a 7-stage lifecycle (`DEFINE` → `SPECIFY/GRILL` → `PLAN` → `DISPATCH` → `COLLECT/VERIFY` → `REVIEW` → `SHIP/RETURN`) using isolated Git worktrees.
* **Knowledge System & Verification**: Projects declare technology profiles and validation commands in `AGENTS.md`. `scripts/project-verify.py` acts as a zero-dependency, deterministic gate for code verification and git hygiene.

---

## 📦 Installed Skills Catalogue

| Package | Skill Name | Primary Purpose |
| :--- | :--- | :--- |
| **`filipkrawiec-core`** | [`ddd`](plugins/common/core/skills/ddd/SKILL.md) | Domain-Driven Design: Ubiquitous language, strategic mapping, and aggregates. |
| | [`hexagonal-architecture`](plugins/common/core/skills/hexagonal-architecture/SKILL.md) | Ports & Adapters: 4-layer architecture (API, App, Domain, Infra) & encapsulation. |
| **`filipkrawiec-workflow`** | [`tdd`](plugins/common/workflow/skills/tdd/SKILL.md) | Test-Driven Development: Red-Green-Refactor cycles using Chicago strategy. |
| | [`vcs`](plugins/common/workflow/skills/vcs/SKILL.md) | Version Control: Git workflow with Conventional Commits and clean history. |
| | [`grill-with-docs`](plugins/common/workflow/skills/grill-with-docs/SKILL.md) | Spec Challenge: Progressive disclosure requirement grilling against knowledge. |
| **`filipkrawiec-orchestration`** | [`orchestrate-delivery`](plugins/common/orchestration/skills/orchestrate-delivery/SKILL.md) | Delivery Flow: Provider-neutral, code-free task orchestration & worktrees. |
| | [`scaffold-monorepo`](plugins/common/orchestration/skills/scaffold-monorepo/SKILL.md) | Repository Scaffolding: Trunk-based monorepo layout with `.devcontainer` and `justfile`. |
| **`filipkrawiec-authoring`** | [`writing-great-skill`](plugins/common/authoring/skills/writing-great-skill/SKILL.md) | Meta-Skill: Authoring, refining, and pruning portable skills & agent rules. |
| | [`teach`](plugins/common/authoring/skills/teach/SKILL.md) | Education: Interactive learning guides and architectural trade-off walkthroughs. |

---

## 🚀 Local Developer & Agent Setup

### Claude Code

Run Claude Code with common plugin packages directly:

```bash
claude \
  --plugin-dir plugins/common/core \
  --plugin-dir plugins/common/workflow \
  --plugin-dir plugins/common/orchestration \
  --plugin-dir plugins/common/authoring
```

*Tip*: Run `./scripts/claude-local-plugins.sh` to launch a pre-configured Claude Code session.

### Codex

Register the repository checkout as a local marketplace:

```bash
codex plugin marketplace add .
codex plugin add filipkrawiec-core@filipkrawiec
codex plugin add filipkrawiec-workflow@filipkrawiec
codex plugin add filipkrawiec-orchestration@filipkrawiec
codex plugin add filipkrawiec-authoring@filipkrawiec
```

### Antigravity (`agy`)

Link common packages and native overlays directly into Antigravity IDE:

```bash
./scripts/link-agy-ide-plugins.sh --replace
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
```

---

## 🤝 Contributing & Maintainer Workflows

Want to add a new skill, update plugin manifests, or prepare a release tag? Read our full [Contributing & Maintenance Guide](CONTRIBUTING.md).

### Release Procedure Summary

* **Pre-merge**: Run the full repository verification suite (`python3 scripts/project-verify.py unit` and `verify`) and submit a Review Request. This stage does not claim a release tag, published version, or completed release.
* **Post-merge**: Once the user merges to `main`, update version manifests, create the annotated tag (`v<version>`), run `python3 scripts/validate-release-version.py`, and push with tags (`git push --follow-tags`).

---

## 📄 License & Public Mandate

This repository is **public**. Do not add proprietary, client, or secret material to skills, plugins, or `knowledge/` entries.
