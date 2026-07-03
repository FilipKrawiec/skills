---
name: writing-great-skill
description: Use when creating, modifying, editing, or validating skills, agent rules (AGENTS.md), or plugin manifests in this repository.
---

# Writing Great Skill

A skill should make agent behavior more predictable. Bold terms are defined in `references/glossary.md`.

## Invocation

- Use **model invocation** only when the agent must discover the skill by itself or another skill must reach it.
- Use **user invocation** when the human should choose the skill explicitly; keep the description as a terse human-facing label unless the target agent supports explicit invocation controls.
- If user-invoked skills become hard to remember, add one **router skill** instead of making every skill model-invoked.

## Description Craft

A model-invoked **description** is always in startup context. It must earn that cost.

- Start with "Use when..." and describe user intent, not implementation.
- Include distinct trigger branches; collapse synonyms.
- Keep the boundary clear enough to avoid near-miss false triggers.
- Stay under 1024 characters.

For user-invoked skills, keep the description as a one-line human summary.

## Information Hierarchy

- Put required **steps** in `SKILL.md`.
- Put only always-needed **reference** in `SKILL.md`.
- Move branch-specific reference behind a clear **context pointer**: "Read X when Y."
  - **Rule**: `X` must be a relative link targeting a file inside the skill's own local `references/` subdirectory.
  - **Rule**: Never use absolute local file URLs (e.g., `file:///Users/...`) or reference files outside the skill directory (including other skills). Context pointers must stay strictly internal to the local `references/` subdirectory.
  - **Rule**: Do not use markdown links (relative or absolute) to files or skills outside the skill's own directory anywhere in `SKILL.md` (e.g., inside steps or descriptions). Reference other skills textually using backticks (e.g., `` `other-skill` ``).
- Keep each meaning in one source of truth.

## Naming Conventions

- **Skill Directory**: Must use `lowercase-kebab-case` (e.g., `domain-driven-design`).
- **Main Instruction File**: Must be named exactly `SKILL.md` (all uppercase).
- **Reference Files**: Must use `lowercase-kebab-case.md` (e.g., `ubiquitous-language.md`), and reside within the local `references/` subdirectory.

## Pruning

Delete lines that are generic, duplicated, stale, or do not change behavior. When a skill feels long, first look for reference that can move down the hierarchy, then look for branches that should split.
