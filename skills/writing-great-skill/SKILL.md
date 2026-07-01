---
name: writing-great-skill
description: Use when creating, modifying, editing, or validating skills, agent rules (AGENTS.md), or plugin manifests in this repository.
---

# Writing Great Skill

A skill should make agent behavior more predictable. Bold terms are defined in `references/GLOSSARY.md`.

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
  - **Rule**: Never use absolute local file URLs (e.g., `file:///Users/...`) or reference arbitrary repository files outside the skill directory.
  - **Rule**: Avoid creating a local reference file if it would only be a one-liner redirecting to another skill's reference. Instead, link directly to that other skill's reference file (e.g., `../other-skill/references/file.md`).
- Keep each meaning in one source of truth.

## Pruning

Delete lines that are generic, duplicated, stale, or do not change behavior. When a skill feels long, first look for reference that can move down the hierarchy, then look for branches that should split.
