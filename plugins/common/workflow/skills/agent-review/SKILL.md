---
name: agent-review
description: One scheduled review pass over open PRs where lanes.json turns on agentReview; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Bash(git:*,gh:*)
---

# Agent Review

- `owner`, `implementer`, `reviewer`, `reviewRounds` (default 3), `alwaysInScope`, `ownerPaths`, `ownerLabels`, `ownerLines` (default 800): `.github/lanes.json`.
- Run every `gh` command as `reviewer`: `GH_TOKEN=$(gh auth token --user <reviewer>) gh ...`; never print the token.
- Never commit, push or edit. Write to GitHub only reviews, thread replies and resolutions, `review:owner` and auto-merge.

## 1. Collect

Agent reviews are the reviewer's reviews starting `<!-- agent-review sha=<HEAD> round=<N> verdict=<V> -->`. Per open PR: an agent review at the head → phase 4; round `reviewRounds` used → skip; else round = 1 + earlier agent reviews.

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
6. is a Dependabot update across a major version, or a minor one below 1.0;
7. changes more than `ownerLines` lines of code;
8. changes code but closes no issue with a scope packet;
9. changes code outside its issues' scope packets and `alwaysInScope`.

Docs (`docs/`, `*.md`), tests and Dependabot's manifests and lockfiles are not code for rules 7–9.

| `verdict=` | When | Review | `review:owner` |
| --- | --- | --- | --- |
| `ready` | No blocking finding or open thread; no owner rule matches. | APPROVE; COMMENT on your own PR | remove |
| `owner` | No blocking finding; an owner rule matches, or a thread waits on an owner check (device, credential). | COMMENT | add |
| `fixes` | Blocking findings, rounds left. | COMMENT | remove |
| `rounds` | Blocking findings in the last round. | COMMENT | add |

Post one review on the head: blocking findings inline; body = marker, verdict (quoting the owner rule), findings (blocking first; `file:line` and failure scenario each), open threads, before and after captures of user-visible changes for `owner`, attribution footer. Reply on each thread the head fixes, naming the commit; resolve only agent-written threads.

**Exit gate:** each PR has its review and label.

## 4. Merge

After each APPROVE: `gh pr merge <pr> --squash --auto --match-head-commit <head>`. Never switch auto-merge off. Report failed merges once.

**Exit gate:** auto-merge state per approved PR.

## 5. Wake the runner

Wake the AFK runner as the caller describes: "Scheduled AFK run." plus AFK PRs needing fixes. Tell the owner after three offline passes. Review PRs the runner reports via phases 2–4.

**Exit gate:** runner woken, or the offline count.

## 6. Report

Only when something needs the owner or shipped; ≤ 8 lines. **Summary:** PRs merged; the runner's lesson PRs, linked. **Decision:** PRs for the owner with reason; runner parks and follow-ups; findings raised on two or more PRs, with target file; each with a recommendation.

**Exit gate:** sent or nothing to report; scratch worktrees removed.
