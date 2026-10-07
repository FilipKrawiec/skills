---
name: spec
description: Use when a need or bug report should become a GitHub issue, an issue needs acceptance criteria or a lane (01 Define, 02 Spec), or issues need triage into lanes or tidying into the standard issue form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec (01 Define, 02 Spec)

Turn a need into one issue another agent can plan from without guessing. Types, cards and the Issue form: [board.md](../../references/board.md).

**With the owner:** every phase. **Unattended:** phase 4, plus phase 1 when `improve` opens a lesson issue; other follow-ups go in its output.

- Every open issue has one lane: `lane:afk` (owner approved), `lane:proposed` (you recommend AFK) or `lane:owner` (needs a decision, credentials, a device, or the owner steers it).
- Apply `lane:afk` only on the owner's yes in the current session.

## 1. Define

Skip when the issue exists.

- Search first: `gh issue list -s all --search "<keywords>"` (`-R <owner/repo>` for another repository); offer to update a match.
- Work that only runs tests becomes criteria of the issues it proves.
- Create from the project's template: title `<type>(<area>): <outcome>`, one type label, priority only when the owner gave one, `lane:owner`.

**Exit gate:** the issue URL.

## 2. Ground

Read the task's code, tests, agent rules and ADRs until the open decisions are clear; record each fact with its source path.

**Exit gate:** verified facts separated from open decisions.

## 3. Grill

- Ask one open decision per round in at most five lines (question, trade-offs, recommendation); wait for the answer.
- Write answers into the issue: intent, non-goals, and `### Acceptance criteria` each provable by a test or a described render. ADRs only for architectural decisions.
- More than one PR: on the owner's yes, one sub-issue per vertical slice under a `type:epic` (board.md's Epics). Slices sharing a file name the one slice owning it.

**Exit gate:** no open decision remains.

## 4. Lane

Read [afk-ready.md](references/afk-ready.md) when proposing, approving or triaging an issue for AFK. Attended issues need no estimate or scope packet.

- Ask the owner: AFK? Yes → `lane:afk`; no → `lane:owner`; unsure → `lane:proposed`.
- Tidy (when asked): apply the Issue form to every open issue and card; list the owner's fixes in the output.
- Merged PRs already meet the criteria: comment one PR link per criterion and propose closing; the owner closes.
- With a board, move each issue now Ready (board.md's States) to Todo.

**Exit gate:** each issue has one lane, at most one new comment.

## Output

Reporting to the owner form. Summary: one line per lane with its issues. Decision: issues awaiting the owner's lane, with your recommendation.
