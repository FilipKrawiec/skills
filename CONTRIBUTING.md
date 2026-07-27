# Contributing & Maintenance Guide

Thank you for contributing to the `skills` repository! This document outlines workflows, guidelines, and commands for creating skills, updating plugins, validating changes, and cutting releases.

---

## 1. Overview & Guidelines

* **Public Repository**: Do not add proprietary, client, or secret material to skills, plugins, or `knowledge/` entries.
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
python3 scripts/project-verify.py unit

# 2. Run plugin definition validator
python3 scripts/project-verify.py verify

# 3. Check Central Knowledge index freshness
python3 scripts/project-verify.py knowledge-index --check --root knowledge
```

### Git Hooks Setup

Configure local Git hooks to automatically run pre-push tag and version checks:

```bash
./scripts/setup-git-hooks.sh
```

---

## 5. Release & Versioning Procedure

Every common package and agent overlay shares a unified repository-wide release version defined by an annotated Git tag (`v<semver>`).

### Release Workflow

1. **Pre-merge**:
   * Update version strings across all `plugin.json` manifests on `main`.
   * Run the verification suite (`python3 scripts/project-verify.py unit && python3 scripts/project-verify.py verify`).
   * Submit a Review Request carrying the task evidence.

2. **Post-merge**:
   * Once the user merges to `main`, create an annotated Git tag matching the manifest version:
     ```bash
     git tag -a v1.1.0 -m "v1.1.0 release"
     ```
   * Run the release validator:
     ```bash
     python3 scripts/validate-release-version.py
     ```
   * Push tag and commits:
     ```bash
     git push --follow-tags
     ```
