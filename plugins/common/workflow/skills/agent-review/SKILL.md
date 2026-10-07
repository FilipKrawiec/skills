---
name: agent-review
description: One scheduled review pass over open PRs where lanes.json turns on agentReview; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Bash(git:*,gh:*)
---

# Agent Review

- Run every `gh` command with the reviewer machine user's token as `GH_TOKEN`, as the host's setup says; never print it.
- Never commit, push or edit; fixes are the implementer's. Write to GitHub only reviews, thread replies and resolutions, `review:owner` and auto-merge.

## 1. Collect

List open PRs. Agent reviews start `<!-- agent-review sha=<HEAD> round=<N> verdict=<V> -->` (or a legacy marker the caller names). Read threads via GraphQL `reviewThreads { isResolved }`.

- Agent review at the head → phase 4.
- Newest used round `reviewRounds` (default 3) → skip.
- Else round = 1 + earlier agent reviews.

**Exit gate:** at most 4 PRs, oldest updated first.

## 2. Review

One isolated worker per PR, in parallel, in a scratch worktree at the head: `review`'s two axes on the diff against the closed issue's acceptance criteria; each unresolved thread fixed (with commit) or still open (blocking). Workers post nothing.

Verify blocking findings; skip PRs whose head moved.

**Exit gate:** verified findings per PR at an unchanged head.

## 3. Post

Pick each PR's verdict from [owner-rules.md](references/owner-rules.md).

- One review on the head: APPROVE when `ready` and not your own PR, else COMMENT. Blocking findings inline; body = marker, verdict, findings (blocking first, optional marked; `file:line` and failure scenario each), every open thread, attribution footer.
- Set `review:owner` and auto-merge per the verdict.
- Reply on each thread the head fixes, naming the commit; resolve only agent-written threads (first comment ends with the footer).

**Exit gate:** each PR has its review, label and auto-merge state.

## 4. Merge

Each PR you approved at its head: auto-merge on; the owner merges the rest; after a merge, comment the round, with footer. Report failed merges once.

**Exit gate:** auto-merge state per approved PR.

## 5. Wake the runner

Wake the AFK runner as the caller describes: "Scheduled AFK run." plus AFK PRs needing fixes, failing or conflicting. Tell the owner after three offline passes. Review PRs the runner reports via phases 2–4.

**Exit gate:** runner woken, or the offline count.

## 6. Report

When something needs the owner or shipped, in [board.md](../../references/board.md)'s Reporting to the owner form. Summary: PRs merged; runner's lesson PRs. Decision: PRs for the owner with reason; runner parks and follow-ups; findings raised on two or more PRs, with target file. Only changed items.

**Exit gate:** sent or nothing to report; scratch worktrees removed.
