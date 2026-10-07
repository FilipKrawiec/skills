# Contributing & Maintenance Guide

Thank you for contributing to the `skills` repository! This document outlines workflows, guidelines, and commands for creating skills, updating plugins, validating changes, and cutting releases.

---

## 1. Overview & Guidelines

* **Public Repository**: Do not add proprietary, client, or secret material to skills or plugin packages.
* **Compact & Agent-Agnostic**: Skills must remain portable, lightweight, and host-neutral.
* **Single Source of Truth**: Move granular domain details into `references/` instead of duplicating them across files.
* **Deterministic Verification**: Every change must pass the automated verification matrix before being published.

---

## 2. Skill Development Workflow

> [!IMPORTANT]
> **Mandatory Rule**: Before editing or creating any skill in this repository, you **must** read [`writing-great-skill`](plugins/common/authoring/skills/writing-great-skill/SKILL.md). It is the canonical source of truth for skill authoring.

### Step 1: Directory Setup

Skills belong under `plugins/common/<package>/skills/<skill-name>/`.

```
plugins/common/<package>/skills/<skill-name>/
├── SKILL.md                 # Primary instruction entrypoint
├── references/              # Context pointers loaded on-demand
│   └── topic.md
└── scripts/                 # Non-interactive CLI helper scripts
```

* **Skill Directory Name**: Must use `lowercase-kebab-case` (e.g., `hexagonal-architecture`).
* **Main Instruction File**: Must be named exactly `SKILL.md` (all uppercase).
* **Reference Files**: Store in `references/` and use `lowercase-kebab-case.md`.

### Step 2: Crafting `SKILL.md`

1. **YAML Frontmatter**: `description` starts with "Use when" and stays within 300 characters; the body stays within 400 words and each reference within 600; `allowed-tools` is required.
   ```yaml
   ---
   name: example-skill
   description: Use when [describe user intent and trigger conditions].
   allowed-tools: Read Bash(git:*)
   ---
   ```
2. **Instruction Wording**: Describe desired behaviors positively. Use prohibitions only for explicit security or safety boundaries.
3. **Context Pointers**: Move detailed reference material into `references/` files and point agents to them:
   ```markdown
   Read [topic.md](references/topic.md) when configuring X settings.
   ```
   *Rule*: Links are relative and point inside the skill's own `references/`, or to the package's shared authority (`../../references/<file>.md`) when the skills of one plugin share it.

---

## 3. Plugin Manifests & Overlay Architecture

Each common package describes itself once, in `package-metadata.json`; `just sync-manifests` (`python3 scripts/validate-plugin-definitions.py --sync`) generates `plugin.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` and both marketplace catalogs from it, and the validator fails when they drift.

### Source of truth (`package-metadata.json`)

```json
{
  "name": "filipkrawiec-core",
  "version": "9.20.0",
  "description": "Core software engineering architecture skills"
}
```

The host manifests point at the skills directory (`"skills": "./skills/"`); every skill under it is included.

* **Common Packages (`plugins/common/*`)**: Portable base plugins without framework-specific GUI code.
* **Agent Overlays (`plugins/<agent>/*`)**: Native overlays providing custom host UX (e.g. Antigravity UI proceed buttons in `plugins/agy/`).

---

## 4. Local Testing & Verification Matrix

Before committing or opening a pull request, run the local verification suite:

### Automated Verifiers

```bash
# 1. Run Python unit tests
just unit              # or: python3 scripts/project-verify.py unit

# 2. Unit tests plus the plugin definition validator
just verify            # python3 scripts/project-verify.py verify runs the validator and git hygiene only

# 3. Regenerate manifests after editing package-metadata.json
just sync-manifests
```

### Contributor Setup & Git Hooks
 
Set up local Git hooks and link development plugins into your local Antigravity environment with a single command:

```bash
just setup             # Configures scripts/git-hooks and links dev plugins
# or separately:
just setup-hooks       # Point core.hooksPath at scripts/git-hooks: pre-push validates; post-commit and post-merge on main run `just refresh`
just link-agy          # Symlink plugins to ~/.gemini/config/plugins
```

---

## 5. Release & Versioning Procedure

Every common package and agent overlay shares a unified repository-wide release version defined by an annotated Git tag (`v<semver>`).

### Owner Release

Only the owner releases; agents never do (`main` requires an approved PR, and only admins may create `v*` tags).

1. On an up-to-date, clean `main`, run `just release` (or `just release minor|patch|major`). It runs `just verify`, refuses unless `main` is clean and level with a freshly fetched `origin/main`, computes the bump from conventional commits, updates package metadata, synchronizes manifests and marketplace catalogs, commits, tags `v<version>`, refreshes installed plugins and pushes the commit and tag in one atomic push (`git push --atomic origin HEAD:main refs/tags/v<version>`), as admin past branch protection.
2. The tag push runs `.github/workflows/release.yml`, which publishes the GitHub Release.
