---
name: agent-review
description: One scheduled review pass over open PRs where lanes.json turns on agentReview; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Bash(git:*,gh:*)
---

# Agent Review

- `<repo>`, `owner`, `implementer`, `reviewer`, `reviewRounds` (default 3), `alwaysInScope`, `ownerPaths`, `ownerLabels`, `ownerLines` (default 800): `.github/lanes.json`.
- Run every `gh` command as `reviewer`: `GH_TOKEN=$(gh auth token --user <reviewer>) gh ...`; never print the token.
- Never commit, push or edit; fixes are the implementer's. Write to GitHub only reviews, thread replies and resolutions, `review:owner` and auto-merge.

## 1. Collect

List open PRs. Agent reviews are the reviewer's reviews starting `<!-- agent-review sha=<HEAD> round=<N> verdict=<V> -->` (or a legacy marker the caller names). Read threads via GraphQL `reviewThreads { isResolved }`.

- Agent review at the head → phase 4.
- Newest used round `reviewRounds` → skip.
- Else round = 1 + earlier agent reviews.

**Exit gate:** at most 4 PRs, oldest updated first.

## 2. Review

One isolated worker per PR, in parallel, in a scratch worktree at the head, invoking `review` for both axes on the diff against the closed issue's acceptance criteria; each unresolved thread fixed (with commit) or still open (blocking). Workers post nothing.

Verify blocking findings; skip PRs whose head moved.

**Exit gate:** verified findings per PR at an unchanged head.

## 3. Post

Read `gh pr view <pr> --json author,labels,title,body,closingIssuesReferences`, the changed paths (`gh api repos/<repo>/pulls/<pr>/files --paginate --jq '.[] | [.filename, .previous_filename, .additions, .deletions]'`; a rename counts both paths) and each closed issue's scope packet. Owner rules, checked in order; quote the first match. The list is closed: a PR matching none merges on your approval and green checks. The PR:

1. carries `review:owner`;
2. has an author other than `owner`, `implementer` or Dependabot;
3. lists no files, or 3000 (the API's cap);
4. touches a path `.github/CODEOWNERS` or `ownerPaths` gives the owner;
5. carries an `ownerLabels` label, which ships or deploys on merge;
6. is a Dependabot update across a major version, or a minor one below 1.0 (title and `Bumps`/`Updates` lines);
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

- Post one review on the head. Blocking findings inline; body = marker, verdict (quoting the owner rule), findings (blocking first, optional marked; `file:line` and failure scenario each), every open thread, before and after captures of each user-visible change for `owner`, attribution footer.
- Label with `gh pr edit <pr> --add-label review:owner` or `--remove-label review:owner`.
- Reply on each thread the head fixes, naming the commit; resolve only agent-written threads (first comment ends with the footer).

**Exit gate:** each PR has its review and label.

## 4. Merge

After each APPROVE: `gh pr merge <pr> --squash --auto --match-head-commit <head>`. Never switch auto-merge off. After a merge, comment the round, with footer. Report failed merges once.

**Exit gate:** auto-merge state per approved PR.

## 5. Wake the runner

Wake the AFK runner as the caller describes: "Scheduled AFK run." plus AFK PRs needing fixes, failing or conflicting. Tell the owner after three offline passes. Review PRs the runner reports via phases 2–4.

**Exit gate:** runner woken, or the offline count.

## 6. Report

Only when something needs the owner or shipped; changed items only; ≤ 8 lines. **Summary:** PRs merged; the runner's lesson PRs, linked. **Decision:** PRs for the owner with reason; runner parks and follow-ups; findings raised on two or more PRs, with target file; each with a recommendation.

**Exit gate:** sent or nothing to report; scratch worktrees removed.
