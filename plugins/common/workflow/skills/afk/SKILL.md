---
name: afk
description: Use when working a GitHub issue queue while the owner is away, picking up the next owner-approved lane:afk issue, running as a scheduled unattended agent, or doing queue housekeeping (tidy worktrees, merge green chore PRs, refresh the board).
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*)
---

# AFK

One run delivers **at most one** owner-approved issue, or parks it with a question, or does housekeeping. The owner holds merge, release and settings authority; the plugin's guard hook enforces it in projects with `.github/lanes.json`.

`LANES` below means `python3 <this skill's directory>/scripts/lanes.py` (or the project's wrapper, e.g. `just lanes`). Every write command is a dry run without `--apply`.

Read [setup.md](references/setup.md) when the repository has no `.github/lanes.json`, or when scheduling unattended runs.

## 1. Pick

Run `LANES next`.

- `next: #N …` → phase 2.
- `in flight: … (stale …)` → `LANES park <N> "<where the branch and log stopped>"`, then phase 4.
- `next: none` → phase 4.

**Exit gate:** one issue number, or the decision to do housekeeping.

## 2. Build

1. `LANES claim <N>` rechecks eligibility, labels `state:claimed` and prints a fresh worktree from the base branch. Work only in that worktree.
2. Read the issue, its parent, linked designs and decisions, and the project's agent rules (AGENTS.md or equivalent).
3. Invoke `tdd`; iterate with the project's targeted test command.
4. Update the user-facing docs the project's rules tie to the change, in the same branch.
5. `LANES scope <N>` passes; then the project's full verification gate passes once.

Park with `LANES park <N> "<one question, the options, a recommendation>"` (pushing the branch when it holds useful work) whenever the issue is ambiguous or contradicts project rules, needs a path outside its scope packet or a protected path, needs an undecided product or model choice, stays red after two honest fix attempts, or needs credentials, settings or a device.

**Exit gate:** green verification and an in-scope diff, or a parked issue.

## 3. Publish

1. Commit, then `git push -u origin HEAD`.
2. `gh pr create --title "<type>(<area>): <outcome>" --body-file <file>` following the project's PR template, with `Closes #<N>`; ready for review.
3. `gh issue edit <N> --remove-label state:claimed`.
4. `LANES automerge <pr>` unless the issue asks for owner review before merge. It enables auto-merge only for docs, tests and Dependabot dependency changes and prints why anything else waits.

**Exit gate:** a PR URL and its auto-merge verdict.

## 4. Housekeeping

Run when no issue was delivered this run, each step once:

1. `LANES tidy --apply`: removes AFK runs' own `afk-<N>` worktrees and branches once their PR is merged or closed; other sessions' checkouts, dirty ones and open PRs stay.
2. For each open Dependabot PR: `LANES automerge <pr>`; when its checks fail, comment the failing excerpt.
3. Invoke `issue-lanes` for the issues `LANES next` lists as untriaged.
4. `LANES board --apply` when lanes.json names a project.

Keep to the queue: new work starts as an issue, not in a run.

**Exit gate:** each step's printed result.

## Output

At most five lines: issue and PR (or "queue empty"), auto-merge verdict, anything parked with its question, housekeeping counts.
