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
  - Rule: `X` must be a relative link targeting a file inside the skill's own local `references/` subdirectory.
  - Exception — shared package authority: skills shipped together in one plugin MAY use a relative link to one package-local authority outside their own directory. Verify that link from the installed package; do not copy the authority per skill.
  - Rule: Never use absolute local file URLs (e.g., `file:///Users/...`) or reference files outside the installed plugin. Reference other skills textually using backticks (e.g., `` `other-skill` ``) unless using the shared-authority exception.
- Keep each meaning in one source of truth.
- Evaluate instruction cost, shared-contract dependency cost, and observed run cost separately; static contract size alone is not a skill-quality failure.

## Naming Conventions

- **Skill Directory**: Must use `lowercase-kebab-case` (e.g., `ddd`).
- **Main Instruction File**: Must be named exactly `SKILL.md` (all uppercase).
- **Reference Files**: Must use `lowercase-kebab-case.md` (e.g., `ubiquitous-language.md`), and reside within a local `references/` subdirectory or the verified shared package authority.
- **Assets**: Store templates and static resources in `assets/`.
- **Scripts**: Store executable helper code in `scripts/`; scripts must be non-interactive and document usage.

## Pruning

Delete lines that are generic, duplicated, stale, or do not change behavior. When a skill feels long, first look for reference that can move down the hierarchy, then look for branches that should split.

---

## Context Pointers

- Read [glossary.md](references/glossary.md) when looking up definitions of bold terms.
- Read [agentskills-guide.md](references/agentskills-guide.md) when designing, optimizing, testing, or specification-validating a skill or custom script.
