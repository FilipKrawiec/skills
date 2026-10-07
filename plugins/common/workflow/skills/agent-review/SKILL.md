---
name: agent-review
description: One scheduled review pass over open PRs where lanes.json turns on agentReview; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Bash(python3:*,git:*,gh:*)
---

# Agent Review

- `LANES` = `python3 <the afk skill's directory>/scripts/lanes.py`.
- Never contribute: no commits, pushes or edits; fixes are the implementer's. Write to GitHub only reviews, thread replies and resolutions, `review:owner`, `LANES hold`, `LANES merge`.

## 1. Collect

List open PRs (not Dependabot's). Agent reviews start `<!-- agent-review sha=<HEAD> round=<N> verdict=<V> -->` (or a legacy marker the caller names). Read threads via GraphQL `reviewThreads { isResolved }`.

- Agent review at the head → phase 4.
- Newest used round `reviewRounds` (default 3) → skip.
- Else round = 1 + earlier agent reviews.

**Exit gate:** at most 4 PRs, oldest updated first.

## 2. Review

One isolated worker per PR, in parallel, in a scratch worktree at the head: `review`'s two axes on the diff against the closed issue's acceptance criteria; each unresolved thread fixed (with commit) or still open (blocking). Workers post nothing.

Verify blocking findings; skip PRs whose head moved.

**Exit gate:** verified findings per PR at an unchanged head.

## 3. Post

Run `LANES triage <pr>`; pick verdict and label from [owner-rules.md](references/owner-rules.md)'s Verdicts.

- One review on the head, APPROVE when `ready`, else COMMENT: blocking findings inline; body = marker, verdict, findings (blocking first, optional marked; `file:line` and failure scenario each), every open thread, attribution footer.
- Write back the full label set. Not `ready` → `LANES hold <pr>`.
- Reply on each thread the head fixes, naming the commit; resolve only agent-written threads, with owner-rules.md's command. A person's thread stays theirs.

**Exit gate:** each PR has the review and right label.

## 4. Merge

Each PR `ready` at its head: `LANES merge <pr>`; after a merge, comment the round, with footer. Report failed merges once.

**Exit gate:** each printed result.

## 5. Wake the runner

Wake the AFK runner as the caller describes: "Scheduled AFK run." plus AFK PRs needing fixes, failing or conflicting. Tell the owner after three offline passes. Review PRs the runner reports via phases 2–4.

**Exit gate:** runner woken, or the offline count.

## 6. Report

When something needs the owner or shipped, in [board.md](../../references/board.md)'s Reporting to the owner form. Summary: PRs merged; runner's lesson PRs. Decision: PRs for the owner with reason; runner parks and follow-ups; findings raised on two or more PRs, with target file. Repeat only changed items; remove scratch worktrees.

**Exit gate:** sent or nothing to report; worktrees removed.
