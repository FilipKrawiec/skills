---
name: plan
description: Use when an issue is specified and needs its implementation plan before code changes (03 Plan), or when resuming work from a posted plan.
allowed-tools: Read Bash(gh:*,git:*)
---

# Plan (03)

Draft a plan, grounded in the actual repository, that execution follows without re-planning the basics. The issue is claimed or started (03 Plan in [board.md](../../references/board.md)) before this skill runs.

**With the owner:** every phase. **Unattended:** the same, with `lane:afk` standing in for approval in phase 3 and a park in place of any question.

## 1. Read

Read the issue, its acceptance criteria, scope packet when it has one, parent and linked decisions; then the code, tests and contracts it touches, and the project's agent rules. When the issue already has a `## Plan` comment, read it and the branch to see where work stopped.

**Exit gate:** each acceptance criterion maps to code and tests you have read.

## 2. Draft

- Files likely to change, inside the scope packet when there is one.
- For each acceptance criterion, the failing test that proves it.
- Ordered implementation steps, each small and verifiable.
- Risks, assumptions and anything that could send the work back to `spec`.

When the plan needs a path outside an existing scope packet or a protected path, or an acceptance criterion turns out ambiguous, stop: unattended runs park the issue; attended sessions release it and return to `spec`.

**Exit gate:** a draft that stays inside the scope packet, or a parked or released issue.

## 3. Approve and post

Attended, show the draft and wait for the owner to approve or adjust it. Post the approved plan as one issue comment headed `## Plan` only when the issue is in `lane:afk` or the work may outlive this session. When resuming, or whenever execution departs from it, edit that comment in place: `gh api -X PATCH repos/<owner/repo>/issues/comments/<id> -F body=@<file>`, where `<id>` is the number after `#issuecomment-` in its url (`gh issue view <N> --json comments`); `gh issue comment --edit-last` may edit another session's newer comment.

**Exit gate:** the `## Plan` comment link, or the owner's approval in the session.

## Output

In board.md's Reporting to the owner form. Summary, one line: the plan's step count and its comment link when posted. Decision: the plan to approve when attended, or the reason the issue went back with its question.
