---
name: afk
description: Use when working a GitHub issue queue while the owner is away, picking up the next owner-approved lane:afk issue, running as a scheduled unattended agent, or doing queue housekeeping (tidy worktrees, merge green chore PRs, refresh the board).
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*)
---

# AFK

One run carries the delivery cycle while the owner is away. It checks what already shipped, tends its own open PRs, then takes **at most one** owner-approved issue from 02 Spec through 03 Plan, 04 Execute and 05 Review, or parks it with a question, or does housekeeping. It always leaves the board current. The owner holds merge, release and settings authority; the plugin's guard hook enforces it in projects with `.github/lanes.json`.

Leave the checkout a run starts in exactly as it is; it may hold the owner's work. Every build and fix happens in a worktree.

`LANES` below means `python3 <this skill's directory>/scripts/lanes.py` (or the project's wrapper, e.g. `just lanes`). Every write command is a dry run without `--apply`. `LANES phase <N>` prints any issue's phase, its next step and its exit gate, and moves the issue on once the phase's artifact exists.

Read [setup.md](references/setup.md) when the repository has no `.github/lanes.json`, or when scheduling unattended runs.

Spend reasoning where the risk is. When the host lets a run or worker choose its reasoning level, use high for `spec` triage, medium for `plan`, `review` and `improve`, low for `tdd`, and the lowest for `ship`, tending and housekeeping; raise it for a step only when it fails twice.

## 1. Ship

Invoke `ship` for the base branch.

**Exit gate:** the base branch is green with shipped issues confirmed, reverted by an open PR, or reported.

## 2. Tend

For each open PR on a branch starting with lanes.json's `branchPrefix` that needs work below, run `LANES start <issue>` first and `LANES release <issue>` after its push, working in its worktree (recreate it from the branch when tidied):

1. A merge conflict → merge the base branch in and resolve it.
2. Failing checks → reproduce, fix and push.
3. An unanswered review that requests changes (a human's, or an automated reviewer's marked blocking) → fix each finding, reply on its thread, push.

Run the project's full verification gate before each push. Park the PR's issue with `LANES park` when a finding needs a product decision or stays red after two honest fix attempts.

**Exit gate:** every own PR is green, conflict-free and has no unanswered blocking review, or its issue is parked.

## 3. Pick

While the base branch is red, go to phase 5. Otherwise run `LANES next`.

- `next: #N …` → phase 4.
- `in flight: … (stale …)` → `LANES park <N> "<where the branch stopped against its ## Plan comment>"`, then phase 5.
- `next: none` → phase 5.

**Exit gate:** one issue number, or the decision to do housekeeping.

## 4. Deliver

1. `LANES claim <N>` rechecks eligibility, labels `state:claimed` and prints a fresh worktree from the base branch. Work only in that worktree; read the issue, its linked decisions and the project's agent rules.
2. Repeat `LANES phase <N>` and do the step it prints, until it prints `phase: 05 Review`. In 04 Execute, also: update the docs the project's rules tie to the change; pass `LANES scope <N>` and the full verification gate before the review worker; give that worker only the issue and the diff; allow two review rounds; title the PR `<type>(<area>): <outcome>` following the project's PR template, linking the `## Plan` comment and the review's verdict.
3. `LANES release <N>`, then `LANES automerge <pr>` unless the issue asks for owner review. It merges (or queues) only docs, tests and Dependabot minor or patch changes and prints why anything else waits.

Park with `LANES park <N> "<one question, the options, a recommendation>"` (pushing the branch when it holds useful work) whenever the issue is ambiguous or contradicts project rules, needs a path outside its scope packet or a protected path, needs an undecided product or model choice, stays red after two honest fix attempts, still has a verified Blocker after the second review round, needs credentials, settings or a device, or `LANES phase <N>` prints something this step does not expect.

**Exit gate:** a PR URL with `phase: 05 Review` and its auto-merge verdict, or a parked issue.

## 5. Housekeeping

Run when no issue was delivered this run, each step once:

1. For each open Dependabot PR: `LANES automerge <pr>`; when its checks fail, comment the failing excerpt.
2. Invoke `spec` to triage the issues `LANES next` lists as untriaged.

Keep to the queue: new work starts as an issue, not in a run. Name any follow-up you found in the output for the owner.

**Exit gate:** each step's printed result.

## 6. Close

Every run ends with:

1. Invoke `improve` for each issue in 07 Improve without a `## Lessons` comment, and for this run's own friction.
2. `LANES tidy --apply`: removes AFK runs' own `afk-*` worktrees and branches once their PR is merged or closed; other sessions' checkouts, dirty ones and open PRs stay.
3. `LANES board --apply` when lanes.json names a project.

**Exit gate:** the lessons (or "no lessons") and both commands' printed result.

## Output

At most eight lines: base branch health and issues shipped, PRs tended, issue and PR (or "queue empty"), auto-merge verdict, anything parked with its question, follow-ups found, lessons with their target file, housekeeping counts.
