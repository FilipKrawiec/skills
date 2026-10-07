---
name: writing-great-skill
description: Use when creating, editing, shortening or reviewing skills, agent rules (AGENTS.md) or plugin manifests in this repository.
allowed-tools: Skill Read Edit Bash(python3:*,just:*)
---

# Writing Great Skill

A skill is a system-prompt fragment: direct orders to an agent that already knows its craft.

## Steps

1. Name the failure the change prevents: an observed run, a review comment or an owner correction. No failure, no rule.
2. Write each rule as one bullet, one or two sentences, imperative ("Run X.", "Never Y; do Z instead."). Add a reason clause only where the rule would be misapplied without it.
3. Cut every line the agent would follow untold: definitions, general best practice, motivation, history, restatements of another skill or of a tooling gate.
4. Run `just verify`; its word budgets are a ceiling, not a target.

## Rules

- **Budgets:** description ≤ 300 characters; `SKILL.md` body ≤ 400 words; a reference ≤ 600 words; a package-shared reference ≤ 800 words. Over budget, move a branch to a reference or split the skill.
- **Frontmatter:** a model-invoked description starts "Use when" and names user intents, not mechanics; a user-invoked skill sets `disable-model-invocation: true` and a one-line label. `allowed-tools` is a space-delimited string, with `Skill` when it invokes another skill.
- **Steps:** number the phases. End each with an **Exit gate** the agent can check: a command's exit code, a file, a label, a PR or CI state.
- **Conditions:** data the agent can read ("the issue has a scope packet"), never another skill's history ("after `spec` ran").
- **One home per rule.** Another skill points to it by name in backticks; skills in one plugin share one package reference at `../../references/<name>.md`.
- **References:** one topic each, tables and checklists over prose, no table of contents. Point to each from `SKILL.md` as "Read `<file>` when <condition>", with conditions that do not overlap.
- **Emphasis:** CAPS or "IMPORTANT" only on the rule runs keep breaking; emphasis everywhere weights nothing.
- **Hedges:** delete "consider", "should generally", "where appropriate". State the default, then the exception.
- **Examples:** one good/bad pair beats a paragraph.
- **Output:** every phase that talks to a human or agent gets an envelope: its fields and a line limit.
- **Calls:** at most two deep, no cycles; a callee returns its exit gate.
- **Names:** say "agent", "AI" or "host"; product names only in host overlays (`plugins/<agent>/`). Directories and references are lowercase kebab-case; scripts in `scripts/` run non-interactively.

## Context pointer

- Read [evaluating.md](references/evaluating.md) when testing whether a skill triggers or changes a run.
