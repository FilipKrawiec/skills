---
name: writing-great-skill
description: Reference for writing and editing skills well.
disable-model-invocation: true
---

# Writing Great Skill

A skill should make agent behavior more predictable. Bold terms are defined in `references/GLOSSARY.md`.

## Invocation

- Use **model invocation** only when the agent must discover the skill by itself or another skill must reach it.
- Use **user invocation** when the human should choose the skill explicitly; set `disable-model-invocation: true`.
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
- Keep each meaning in one source of truth.

## Pruning

Delete lines that are generic, duplicated, stale, or do not change behavior. When a skill feels long, first look for reference that can move down the hierarchy, then look for branches that should split.
