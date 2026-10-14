---
name: agent-review
description: Use when a scheduled task asks for one unattended review pass over open PRs, or an AFK run or refinement asks the reviewer to decide a fork, in a repository whose .github/lanes.json turns on agentReview. Never for an owner's own interactive review.
allowed-tools: Skill Read Bash(git:*,gh:*)
---

# Agent Review

- `owner`, `implementer`, `reviewer`, `reviewRounds` (default 3), `alwaysInScope`, `ownerPaths`, `ownerLabels`, `ownerLines` (default 800), `reviewQueue`: `.github/lanes.json`.
- Run every `gh` command as `reviewer`: `GH_TOKEN=$(gh auth token --user <reviewer>) gh ...`; never print the token.
- Never commit, push or edit. Write to GitHub only reviews, thread replies and resolutions, `review:owner`, auto-merge, the `reviewQueue` issue and phase 0's decisions.
- Before judging code or a decision, invoke the craft, design and UX skills the project's agent rules name.

## 0. Decide

Asked to decide one fork (issue, question, options, recommendation), run only this phase; an implementer never widens its own scope.

1. Return `owner: <reason>` when it adds cost, reverses a recorded owner decision, goes beyond the issue's intent, touches an owner path (rule 4), can't be undone, or needs credentials, settings or a device.
2. Else read the issue and code; decide, UX and craft included: the recommendation unless the evidence favours another option. A widened packet gains only paths its criteria need, outside other claims' packets.
3. Patch the issue's packet or criteria to match, then comment `<!-- agent-decision -->`, question, decision and reason in ≤ 3 lines.

**Exit gate:** `decided: <option>` with the comment link, or `owner: <reason>`.

## 1. Collect

Agent reviews are the reviewer's reviews starting `<!-- agent-review sha=<HEAD> round=<N> verdict=<V> -->`. Per open PR, first case that fits:

1. A draft: skip it.
2. An agent review exists at the head: go to phase 4.
3. Its newest agent review used round `reviewRounds`: skip it.
4. Otherwise: review it as round 1 + its earlier agent reviews.

**Exit gate:** at most 4 PRs, oldest updated first.

## 2. Review

One isolated worker per PR, in parallel, in a worktree at the head, invokes `review` for both axes against the closed issue's acceptance criteria, and marks each unresolved thread fixed (with commit) or open (blocking). Workers post nothing. Verify blocking findings; skip PRs whose head moved.

**Exit gate:** verified findings per PR at an unchanged head.

## 3. Post

Owner rules, in order; quote the first match. A PR matching none merges on your approval and green checks. The PR:

1. carries `review:owner`;
2. has an author other than `owner`, `implementer` or Dependabot;
3. lists no files, or 3000 (the API cap);
4. touches a path `.github/CODEOWNERS` or `ownerPaths` gives the owner (a rename counts both paths);
5. carries an `ownerLabels` label;
6. is a Dependabot update across a major version, or a minor one below 1.0;
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

With `reviewQueue` in lanes.json, read [queue.md](references/queue.md) and rewrite that issue's ordered list.

**Exit gate:** the issue body lists this pass's PRs in order, or no `reviewQueue`.

## 6. Wake the runner

Wake the AFK runner as the caller describes: "Scheduled AFK run." plus AFK PRs needing fixes. Tell the owner after three offline passes. Review PRs the runner reports via phases 2–4.

**Exit gate:** runner woken, the offline count, or the caller runs `afk` itself.

## 7. Report

≤ 8 lines. Open with `Blocked: <cause>` or `Waiting on <owner>: <what>` and stay flagged when either applies; else archive. **Summary:** PRs merged; the runner's lesson PRs, linked. **Decision:** PRs for the owner with reason, linking the queue; runner parks and follow-ups; findings raised on two or more PRs, with target file; each with a recommendation.

**Exit gate:** report sent; scratch worktrees removed.
