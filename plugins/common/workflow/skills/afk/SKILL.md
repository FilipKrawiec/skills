---
name: afk
description: Use when a scheduled task or an orchestrating session's brief asks for one unattended AFK run, optionally naming the issue, in a repository with .github/lanes.json. Never for an owner's own interactive work.
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*,lsof:*)
---

# AFK

One run delivers **at most one** `lane:afk` issue; park instead of asking.

- Take the recommended option on every decision and record it in the issue, plan or PR; park only when it changes UX beyond the acceptance criteria, adds cost (spend, quota, paid services), or departs from software best practice or the codebase's design patterns.
- `<base>` (default `main`), `branchPrefix` (default `agent/afk-`), `staleClaimHours` (default 3), `alwaysInScope`, `project`: `.github/lanes.json` on `origin/<base>`.
- Never touch the starting checkout; work only in worktrees. Run only `git`, `gh`, `just`, `python3` and `lsof`, one command at a time; compound shell stalls on permission prompts.
- **Park** an issue: push useful work; replace `lane:afk` and `state:*` with `lane:owner`; comment the question, options and recommendation in ≤ 5 lines.
- Models: the strongest model runs `spec`, `plan`, review axis A and `improve`; a worker on the host's fast model runs the `tdd` steps and review axis B. Reasoning: high `spec`; medium `plan`, `review`, `improve`; low `tdd`; lowest otherwise.
- Read [setup.md](references/setup.md) without `.github/lanes.json` or when scheduling runs.
- Read [github-safety.md](references/github-safety.md) when setting up or checking the repository's GitHub settings.

## 1. Ship

Invoke `ship` to check base CI, revert a breaking AFK merge and confirm shipped issues.

**Exit gate:** `ship`'s exit gate.

## 2. Tend

For each open `branchPrefix` PR whose issue has `lane:afk`: invoke `vcs` to make it ready to merge. Never switch auto-merge off. Park on an owner decision or two failed fixes.

**Exit gate:** each own PR green and conflict-free, or parked.

## 3. Pick

First case that fits:

1. Base red: go to phase 5.
2. A `state:claimed` issue has no open PR: another run is delivering it. Park it if its newest claim is older than `staleClaimHours`; go to phase 5 either way.
3. Otherwise pick the top candidate.

Candidates are open `lane:afk` issues with no `state:` label, acceptance criteria and a scope packet (a ```` ```scope ```` block); not `type:epic` or `type:task`; no open PR closing them (a stacked PR names `Closes #<N>` only in its body); every packet dependency closed as completed; no packet path in an open `branchPrefix` PR's files. Rank by the board's Priority, else a `priority:P*` label, then lowest number.

**Exit gate:** `next: #<N>` → phase 4; none → phase 5.

## 4. Deliver

1. Invoke `vcs` to start the issue; on `blocked by #<pr>`, go to phase 5.
2. Invoke `plan`. Dispatch a fast-model worker, given the issue, the `## Plan` comment and the worktree, to invoke `tdd` for each step and `vcs` to commit it and update docs the change makes stale; it returns `done` or `tdd`'s `stuck`. On `stuck`, amend the plan and re-dispatch; a step stuck twice you run yourself. Pass the scope check and the verify gate (the project's `verify` task).
3. Two fresh-context workers, given only issue and diff, each invoke `review` for one axis; fix their findings. Say `review round <n> of 2` before each round; stop after round 2 and list what is left under Decision.
4. Invoke `vcs` to open the PR.

Scope check: every path in `git diff --name-only --no-renames $(git merge-base origin/<base> HEAD)` and `git ls-files -o --exclude-standard` equals a packet path, or sits under a packet path ending in `/` or an `alwaysInScope` prefix. Revert any other path, or park when the issue needs it.

Park when the issue is ambiguous or contradicts rules; needs a path outside its packet or one `.github/CODEOWNERS` or `ownerPaths` gives the owner, an owner decision (UX beyond the criteria, cost, departing from best practice or the codebase's patterns), credentials, settings or a device; or stays red after two attempts. Before parking a failure, trace it to its raising call.

**Exit gate:** PR URL with auto-merge on, or a parked issue.

## 5. Housekeeping

Only when nothing was delivered: comment the failing excerpt on each red Dependabot PR; invoke `spec` to lane open issues without a `lane:` label. List follow-ups; never start them.

**Exit gate:** each comment and `spec` result.

## 6. Close

Invoke `improve` for shipped issues awaiting lessons and this run's friction; invoke `vcs` to tidy.

**Exit gate:** `improve`'s exit gates; worktrees removed.

## Output

≤ 8 lines, changed items only. **Summary:** base health, PRs tended, delivered PR (or "queue empty"), lesson PRs, linked. **Decision:** parks, follow-ups and proposed lessons, each with a recommendation, or "Nothing needed."
