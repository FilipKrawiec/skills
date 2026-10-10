---
name: writing-great-skill
description: Use when creating, editing, shortening or reviewing skills, agent rules (AGENTS.md) or plugin manifests in this repository.
allowed-tools: Skill Read Edit Bash(python3:*,just:*)
---

# Writing Great Skill

A skill is a system-prompt fragment: direct orders to an agent that already knows its craft. The host loads `SKILL.md` when the description matches; any other file loads only if the agent decides to open it, and runs show it often does not. Write every skill so a run that reads only its `SKILL.md` still does the job right.

## Steps

1. Name the failure the change prevents: an observed run, a review comment or an owner correction. No failure, no rule.
2. Place the rule in the skill whose phase acts on it (Placement below).
3. Write it as plain imperative sentences an agent new to this repository can follow cold: "Run X.", "Never Y; do Z instead." Give the reason in one clause where the agent must judge a case the rule does not name, or where a capable agent would otherwise override the rule ("never rebase: it detaches review threads").
4. Cut every line the agent would follow untold: general best practice, background paragraphs, history, restatements of a tooling gate.
5. Run `just verify`; its word budgets are a ceiling, not a target.

## Placement

- **Self-contained:** everything a run always needs lives in `SKILL.md`. If every run would read a file, inline it.
- **References hold optional branches only:** detail some runs skip (one language, one test level, one setup task), pointed to as "Read `<file>` when <condition>" with conditions that do not overlap. Never make loading a reference a step or an exit gate.
- **No shared or injected procedures:** no package-shared reference files and no session hooks that inject rules; hooks are host-specific and shared files go unread. A host overlay (`plugins/<agent>/`) carries host mechanics only, never a skill's procedure.
- **One owner per procedure:** a procedure two skills use lives in the skill that performs it, because invocation loads a skill and a "see X" pointer loads nothing. The caller writes the step as "Invoke `<skill>` to <intent>"; the owner's Steps branch on that intent. When the owner cannot branch that way, the procedure becomes its own skill. A rule of one or two lines, such as an output envelope, is repeated in each skill that uses it.
- **Define terms where they are used:** a name coined in another file ("Merge gate", "Issue steps") means nothing to an agent that has not read it. State the step, or invoke the skill that owns it. Use one name per concept across skills (the *verify gate*, never also "full verification" or "completion gate").

## Rules

- **Budgets:** description ≤ 300 characters; `SKILL.md` body ≤ 800 words; a reference ≤ 600 words. Over budget, split the skill along a user intent or move a branch some runs skip to a reference, never content every run needs.
- **Frontmatter:** a model-invoked description starts "Use when" and names user intents, not mechanics; a user-invoked skill sets `disable-model-invocation: true` and a one-line label. `allowed-tools` is a space-delimited string, with `Skill` when it invokes another skill.
- **Steps:** number the phases. End each with an **Exit gate** the agent can check: a command's exit code, a file, a label, a PR or CI state.
- **Conditions:** data the agent can read ("the issue has a scope packet"), never another skill's history ("after `spec` ran"). Write a branch of three or more cases as a list, one case per line, first match wins.
- **Emphasis:** CAPS or "IMPORTANT" only on the rule runs keep breaking; emphasis everywhere weights nothing.
- **Hedges:** delete "consider", "should generally", "where appropriate". State the default, then the exception.
- **Examples:** one good/bad pair beats a paragraph.
- **Output:** every phase that talks to a human or agent gets an envelope, written out in that skill: its fields and a line limit. A fixed format (PR body, report) shows one filled instance in a code block; a step that spawns a worker shows the worker's whole brief, since that brief is all the worker knows.
- **Calls:** at most two deep, no cycles; a callee returns its exit gate.
- **Names:** say "agent", "AI" or "host"; product names only in host overlays (`plugins/<agent>/`). Directories and references are lowercase kebab-case; scripts in `scripts/` run non-interactively.

## Example

Bad, a pointer the agent may never follow: "Then run board.md's Merge gate."

Good, the step itself: "Run `gh pr checks <pr>`; fix failing checks and conflicts before asking the owner to merge."

## Context pointer

- Read [evaluating.md](references/evaluating.md) when testing whether a skill triggers or changes a run.
