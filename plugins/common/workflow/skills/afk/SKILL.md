---
name: afk
description: Use when a scheduled task or an orchestrating session's brief asks for one unattended AFK run, optionally naming the issue, in a repository with .github/lanes.json. Never for an owner's own interactive work.
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*,lsof:*)
---

# AFK

One run delivers **at most one** `lane:afk` issue; park instead of asking.

- Take and record the recommended option on every decision you may take.
- `<base>` (default `main`), `branchPrefix` (default `agent/afk-`), `staleClaimHours` (default 3), `alwaysInScope`, `project`, `ownerLines` (default 800): `.github/lanes.json` on `origin/<base>`.
- Work only in worktrees, never the main checkout. Run one command at a time; compound shell stalls on prompts.
- **Park** an issue: push useful work; replace `lane:afk` and `state:*` with `lane:owner`; comment question, options and recommendation in ≤ 5 lines.
- Models: strongest for `spec`, `plan`, `improve`, review axis A; fast for `tdd` steps, review axis B. Reasoning: high `spec`; medium `plan`, `review`, `improve`; low `tdd`; lowest otherwise.
- Read [setup.md](references/setup.md) without `.github/lanes.json` or when scheduling runs.
- Read [github-safety.md](references/github-safety.md) when setting up or checking GitHub settings.

## 1. Ship

Invoke `ship`.

**Exit gate:** `ship`'s exit gate.

## 2. Tend

For each open `branchPrefix` PR whose issue has `lane:afk`: invoke `vcs` to make it ready to merge. Never switch auto-merge off. Park on an owner decision or two failed fixes.

**Exit gate:** each own PR green and conflict-free, or parked.

## 3. Pick

1. Base red: go to phase 5.
2. Park each `lane:afk` issue with `state:claimed` and no open PR whose newest claim is older than `staleClaimHours`. Remaining claims are active deliveries; at three or more, or one without a valid packet, go to phase 5.
3. Otherwise pick the top candidate.

Candidates are open `lane:afk` issues with no `state:` label, acceptance criteria and a scope packet (a ```` ```scope ```` block); not `type:epic`/`type:task`; no open PR closing them (a stacked PR names `Closes #<N>` only in its body); every packet dependency and blocked-by issue closed as completed; no packet path overlapping an open `branchPrefix` PR's files or a remaining claim's packet. Paths overlap when equal or a `/`-ending one contains the other; test directories and files never overlap.

An issue held back only by one non-draft `branchPrefix` PR carrying `review:owner` or closing a parked issue is a stacked candidate. Rank unstacked first, then board Priority or a `priority:P*` label, then lowest number.

**Exit gate:** `next: #<N>` → phase 4; none → phase 5.

## 4. Deliver

1. Re-read active claims before `vcs` starts (three or overlapping: phase 5) and after claiming: order by timestamp, then number; keep at most three non-overlapping packets. If yours loses, or on `blocked by …`, remove `state:claimed`, return its card to Todo; go to phase 5.
2. Invoke `vcs` to start the issue, naming any parent, then `plan`. Planned code (not docs, tests, lockfiles) over `ownerLines`: plan a self-contained first part within it; invoke `spec` to move the rest to a `lane:afk` issue blocked by this one. Dispatch a fast-model worker, given the issue, the `## Plan` comment and worktree, to invoke `tdd` per step and `vcs` to commit it, updating stale docs; it returns each step's `🔴→🟢` line, or `tdd`'s `stuck`. On `stuck`, amend the plan and re-dispatch; a step stuck twice you run yourself. Pass the scope check and verify gate (project's `verify` task).
3. Two fresh-context workers, given only issue and diff, each invoke `review` for one axis; fix their findings. Say `review round <n> of 2` before each; after round 2, list what is left under Decision.
4. Invoke `vcs` to open the PR.

Scope check: every path in `git diff --name-only --no-renames $(git merge-base origin/<base> HEAD)` (stacked: the parent's branch for `<base>`) and `git ls-files -o --exclude-standard` equals a packet path, or sits under a packet path ending in `/` or an `alwaysInScope` prefix. Revert any other path or ask the reviewer for it.

Ask the reviewer for a path outside the packet or a choice the criteria leave open: with `agentReview`, dispatch a fresh-context worker: "Invoke `agent-review` to decide on #<N>: <question>; options <A>, <B>; recommended <A>: <evidence>." On `decided`, continue; on `owner`, or without `agentReview`, park.

Park when the issue contradicts rules; needs an owner path (`.github/CODEOWNERS`, `ownerPaths`), credentials, settings or a device; or stays red after two attempts. Before parking a failure, trace it to its raising call.

**Exit gate:** PR URL, auto-merge on unless stacked, or a parked issue.

## 5. Housekeeping

Nothing delivered: comment the failing excerpt on each red Dependabot PR; invoke `spec` to lane open issues without a `lane:` label. List follow-ups; never start them.

**Exit gate:** each comment and `spec` result.

## 6. Close

Invoke `improve` for shipped issues awaiting lessons and run friction; invoke `vcs` to tidy.

**Exit gate:** `improve`'s exit gates; worktrees removed.

## Output

≤ 8 lines, changed items only. **Summary:** base health, PRs tended, delivered PR (or "queue empty"), lesson PRs, linked. **Decision:** parks, follow-ups and proposed lessons, each with a recommendation. Open with `Blocked: <cause>` or `Waiting on <owner>: <what>` and stay flagged when either applies; else archive.
