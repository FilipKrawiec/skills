---
name: improve
description: Use when a change has shipped (07 Improve) or friction, rework or a repeated review finding should become a lasting change to skills, agent rules or docs.
allowed-tools: Skill Read Edit Write Bash(gh:*,git:*,python3:*,just:*)
---

# Improve (07)

## 1. Collect

For each shipped issue awaiting lessons (closed as completed in the last 30 days, its newest `## Shipped` comment newer than any `## Lessons`) or this session, list parks, failed fixes, review findings, red base, owner corrections (agent memory too), missing commands or docs, and rules that cost time without preventing a failure. Find earlier occurrences with `gh search issues "## Lessons" -R <owner/repo>`.

**Exit gate:** friction points with evidence and earlier occurrences, or none.

## 2. Place

- A lesson needs two linked occurrences or the owner's request; one occurrence is an observation only.
- Prefer a script or gate that makes the failure impossible, then editing or deleting a rule, then a new rule.
- One target per lesson: the skill owning the phase (rules holding in any project); project agent rules (project-only); `.github/lanes.json` (scope, merge) or `.github/CODEOWNERS` (owner paths); issue template or `spec` (unbuildable issues); docs or assets. Delete a rule that cost more than it prevented.
- Lessons go into skills or project rules, never agent memory; replace text or memory restating a skill with a link.
- Scrub secrets, internal hostnames, client names and local paths.

**Exit gate:** each lesson has a target file and wording.

## 3. Record

Comment `## Lessons` on the shipped issue ("no lessons" when none): lessons with occurrences, target, wording; observations one line each. No shipped issue: use the output.

**Exit gate:** the comment link, or the output.

## 4. Propose

One issue and PR per target repository. Leave out lessons for `.github/lanes.json` or CODEOWNERS (hand the owner the exact line), needing a product decision, or matching an open issue or PR (link it).

1. Invoke `spec` (`-R <owner/repo>`) for an issue carrying targets and wordings.
2. Invoke `vcs` to start branch `<branchPrefix>lesson-<N>-<slug>` from the target's base (another repository: clone it to the host's temp directory first). Invoke `writing-great-skill` and write the change to its standard; pass the target's verification gate (word budgets included).
3. Invoke `vcs` to open the PR, linking the `## Lessons` comment.
4. Owner approved the wording this session: ask them to approve the PR on GitHub, where auto-merge lands it.
5. Link issue and PR from `## Lessons` (or output); remove a temp clone.

**Exit gate:** each lesson linked to its PR, or a proposal with its reason.

## Output

≤ 8 lines. **Summary:** each lesson PR with targets and change, or "no lessons" and the observation count. **Decision:** proposals left, with target, reason and a recommendation, or "Nothing needed."
