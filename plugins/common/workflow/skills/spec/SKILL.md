---
name: spec
description: Use when a need or bug report should become a GitHub issue, an issue needs acceptance criteria or a lane (01 Define, 02 Spec), or issues need triage into lanes or tidying into the standard issue form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec (01 Define, 02 Spec)

Turn a need into one issue another agent can plan from without guessing.

**With the owner:** every phase. **Unattended:** phase 4, plus phase 1 when `improve` opens a lesson issue; other follow-ups go in its output.

- Every open issue has one lane: `lane:afk` (owner approved), `lane:proposed` (you recommend AFK) or `lane:owner` (needs an owner decision, credentials, a device, or the owner steers it).
- Apply `lane:afk` only on the owner's yes in the current session.
- Take the recommended option on every decision and record it in the issue, plan or PR; ask the owner only when it changes UX beyond the acceptance criteria, adds cost (spend, quota, paid services), or departs from software best practice or the codebase's design patterns. Unattended, such a decision moves the issue to `lane:owner` with the question. The approvals a skill reserves for the owner (`lane:afk`, approving or merging a PR) stay theirs.
- With a board (`.github/lanes.json` `project`), move cards with `gh project item-edit`; without one, use `priority:P*` labels instead of the Priority field.

## 1. Define

Skip when the issue exists.

- Search existing issues first; update a match instead of opening a new issue.
- Work that only runs tests becomes criteria of the issues it proves.
- Create from the project's template: title `<type>(<area>): <outcome>`, `lane:owner`, priority only when the owner gave one, and one type label: `type:story` (`feat`), `type:bug` (`fix`), `type:chore` (`chore`, `docs`, `test`, `ci`, `refactor`, `perf`), `type:task` (`task`: a finding, never AFK) or `type:epic`.

**Exit gate:** the issue URL.

## 2. Ground

Read the code, tests, agent rules and ADRs until the open decisions are clear; cite each fact's source path.

**Exit gate:** verified facts separated from open decisions.

## 3. Grill

- Settle each open decision on your recommendation; ask the owner the ones the rule above names, one per round in ≤ 5 lines (question, trade-offs, recommendation).
- Write answers into the issue: intent, non-goals, and `### Acceptance criteria` each provable by a test or a described render. ADRs only for architectural decisions.
- More than one PR: one sub-issue per vertical slice under a `type:epic`. Only epics have sub-issues, and they hold all its remaining work; nobody claims or opens a PR for an epic. Slices sharing a file name the one slice owning it.

**Exit gate:** no open decision remains.

## 4. Lane

Read [afk-ready.md](references/afk-ready.md) when proposing, approving or triaging an issue for AFK. Attended issues need no estimate or scope packet.

- Ask the owner: AFK? Yes → `lane:afk`; no → `lane:owner`; unsure → `lane:proposed`.
- Tidy (when asked): bring every open issue and card to the issue form below; list the owner's fixes in the output.
- Merged PRs already meet the criteria: comment one PR link per criterion and propose closing; the owner closes.
- With a board, move each issue now Ready (meets the issue form, no `state:` label) to Todo.

Issue form: one type label and the matching title; one lane when open, no `state:` label when closed; `### Acceptance criteria`, plus `### Estimate` and a scope packet (a ```` ```scope ```` block of the paths the work may touch) in `lane:afk` and `lane:proposed`; slices under their epic; a card with Priority P0–P2, a slice taking its epic's; an epic's card In progress once it has sub-issues.

**Exit gate:** each issue has one lane, at most one new comment.

## Output

≤ 5 lines. **Summary:** one line per lane with its issues, linked. **Decision:** issues awaiting the owner's lane, with your recommendation, or "Nothing needed."
