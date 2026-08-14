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

1. **YAML Frontmatter**: Keep under 1024 characters total.
   ```yaml
   ---
   name: example-skill
   description: Use when [describe user intent and trigger conditions].
   ---
   ```
2. **Instruction Wording**: Describe desired behaviors positively. Use prohibitions only for explicit security or safety boundaries.
3. **Context Pointers**: Move detailed reference material into `references/` files and point agents to them:
   ```markdown
   Read [topic.md](references/topic.md) when configuring X settings.
   ```
   *Rule*: Always use relative links to files inside the skill's `references/` subdirectory. Do not use absolute `file:///` URLs or link across unrelated packages.

---

## 3. Plugin Manifests & Overlay Architecture

Plugins group skills together into package manifests (`plugin.json`).

### Manifest Structure (`plugin.json`)

```json
{
  "name": "filipkrawiec-core",
  "version": "1.0.0",
  "description": "Core software engineering architecture skills",
  "skills": [
    "skills/ddd",
    "skills/hexagonal-architecture"
  ]
}
```

* **Common Packages (`plugins/common/*`)**: Portable base plugins without framework-specific GUI code.
* **Agent Overlays (`plugins/<agent>/*`)**: Native overlays providing custom host UX (e.g. Antigravity UI proceed buttons in `plugins/agy/`).

---

## 4. Local Testing & Verification Matrix

Before committing or submitting a Review Request, run the local verification suite:

### Automated Verifiers

```bash
# 1. Run Python unit tests
just unit              # or: python3 scripts/project-verify.py unit

# 2. Run plugin definition validator
just verify            # or: python3 scripts/project-verify.py verify

# 3. Check release version alignment
just release-check     # or: python3 scripts/validate-release-version.py
```

### Git Hooks Setup

Configure local Git hooks to automatically run pre-push tag and version checks:

```bash
just setup-hooks
```

---

## 5. Release & Versioning Procedure

Every common package and agent overlay shares a unified repository-wide release version defined by an annotated Git tag (`v<semver>`).

### Automated Semantic Release

Releases are automated from conventional commits via GitHub Actions or locally via `just release`:

1. **Automated CI Release**:
   * Pushes to `main` with conventional commits (`feat:`, `fix:`, `feat!:`, `BREAKING CHANGE:`) automatically trigger `.github/workflows/release.yml`.
   * The workflow runs tests, calculates the semver bump, synchronizes plugin manifests, commits the version bump, creates an annotated tag, and publishes a GitHub Release.

2. **Local Release Execution**:
   * Maintainers can trigger a local semantic release:
     ```bash
     just release           # Automated semver bump based on conventional commits
     # or: just release minor / just release patch / just release major
     ```
   * The release script verifies a clean working tree, updates package metadata, synchronizes manifests, tags the commit, and refreshes installed plugins.
