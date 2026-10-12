---
name: agent-review
description: Use when a scheduled task asks for one unattended review pass over open PRs, in a repository whose .github/lanes.json turns on agentReview. Never for an owner's own interactive review.
allowed-tools: Skill Read Bash(git:*,gh:*)
---

# Agent Review

- `owner`, `implementer`, `reviewer`, `reviewRounds` (default 3), `alwaysInScope`, `ownerPaths`, `ownerLabels`, `ownerLines` (default 800), `reviewQueue`: `.github/lanes.json`.
- Run every `gh` command as `reviewer`: `GH_TOKEN=$(gh auth token --user <reviewer>) gh ...`; never print the token.
- Never commit, push or edit. Write to GitHub only reviews, thread replies and resolutions, `review:owner`, auto-merge and the `reviewQueue` issue.

## 1. Collect

Agent reviews are the reviewer's reviews starting `<!-- agent-review sha=<HEAD> round=<N> verdict=<V> -->`. Per open PR, first case that fits:

1. A draft: skip it; its author is still at work, and a draft never auto-merges.
2. An agent review exists at the head: go to phase 4.
3. Its newest agent review used round `reviewRounds`: skip it.
4. Otherwise: review it as round 1 + its earlier agent reviews.

**Exit gate:** at most 4 PRs, oldest updated first.

## 2. Review

One isolated worker per PR, in parallel, in a scratch worktree at the head, invokes `review` for both axes against the closed issue's acceptance criteria, and marks each unresolved thread fixed (with commit) or open (blocking). Workers post nothing. Verify blocking findings; skip PRs whose head moved.

**Exit gate:** verified findings per PR at an unchanged head.

## 3. Post

Owner rules, checked in order; quote the first match. The list is closed: a PR matching none merges on your approval and green checks. The PR:

1. carries `review:owner`;
2. has an author other than `owner`, `implementer` or Dependabot;
3. lists no files, or 3000 (the API's cap);
4. touches a path `.github/CODEOWNERS` or `ownerPaths` gives the owner (a rename counts both paths);
5. carries an `ownerLabels` label;
6. is a Dependabot update across a major version, or a minor one below 1.0 (read the title and `Bumps`/`Updates` lines);
7. changes more than `ownerLines` lines of code;
8. changes code but closes no issue with a scope packet (a ```` ```scope ```` block of allowed paths);
9. changes code outside its issues' scope packets and `alwaysInScope`.

Docs (`docs/`, `*.md`), tests and Dependabot's manifests and lockfiles are not code for rules 7–9.

| `verdict=` | When | Review | `review:owner` |
| --- | --- | --- | --- |
| `ready` | No blocking finding or open thread; no owner rule matches. | APPROVE; COMMENT on your own PR | remove |
| `owner` | No blocking finding; an owner rule matches, or a thread waits on an owner check (device, credential). | COMMENT | add |
| `fixes` | Blocking findings, rounds left. | COMMENT | remove |
| `rounds` | Blocking findings in the last round. | COMMENT | add |

Post one review on the head: blocking findings inline; body = marker, verdict (quoting the owner rule), findings (blocking first; `file:line` and failure scenario each), open threads, before and after captures of user-visible changes for `owner`, attribution footer. Reply on each thread the head fixes, naming the commit; resolve only agent-written threads (first comment ends with the footer).

**Exit gate:** each PR has its review and label.

## 4. Merge

After each APPROVE: `gh pr merge <pr> --squash --auto --match-head-commit <head>`. Never switch auto-merge off. Report failed merges once.

**Exit gate:** auto-merge state per approved PR.

## 5. Queue

With `reviewQueue` (an issue number), keep that issue the owner's one ordered review list: pin it once with `gh issue pin`, then rewrite its body each pass with `gh issue edit <n> --body "<list>"`, which notifies no one. List every open non-draft PR carrying `review:owner`, and the owner's own PRs with blocking findings; first difference wins:

1. Fixes a red `<base>`.
2. Unblocks more: drafts whose body says `Stacked on #<pr>`, plus open issues it blocks or shares packet paths with.
3. Its issues' highest board Priority, else `priority:P*` label; none last.
4. Oldest first.

One line each: `1. #<pr> <title>: <owner rule or finding>; unblocks #<a>, #<b>`. None: "Nothing waits for the owner."

**Exit gate:** the issue body lists this pass's PRs in order.

## 6. Wake the runner

Wake the AFK runner as the caller describes: "Scheduled AFK run." plus AFK PRs needing fixes. Tell the owner after three offline passes. Review PRs the runner reports via phases 2–4.

**Exit gate:** runner woken, the offline count, or the caller runs `afk` itself.

## 7. Report

Only when something needs the owner or shipped; ≤ 8 lines. **Summary:** PRs merged; the runner's lesson PRs, linked. **Decision:** PRs for the owner with reason, linking the queue; runner parks and follow-ups; findings raised on two or more PRs, with target file; each with a recommendation.

**Exit gate:** sent or nothing to report; scratch worktrees removed.
