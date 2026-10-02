---
name: afk
description: Use when working a GitHub issue queue while the owner is away, picking up the next owner-approved lane:afk issue, running as a scheduled unattended agent, or doing queue housekeeping (tidy worktrees, merge green chore PRs, refresh the board).
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*)
---

# AFK

One run carries the delivery cycle while the owner is away. It checks what already shipped, tends its own open PRs, then takes **at most one** owner-approved issue from 02 Spec through 03 Plan, 04 Execute and 05 Review, or parks it with a question, or does housekeeping. It always leaves the board current. The owner holds merge, release and settings authority; the plugin's guard hook enforces it in projects with `.github/lanes.json`.

Leave the checkout a run starts in exactly as it is; it may hold the owner's work. Every build and fix happens in a worktree.

`LANES` below means `python3 <this skill's directory>/scripts/lanes.py` (or the project's wrapper, e.g. `just lanes`). Every write command is a dry run without `--apply`.

Read [setup.md](references/setup.md) when the repository has no `.github/lanes.json`, or when scheduling unattended runs.

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

While the base branch is red, go to phase 6. Otherwise run `LANES next`.

- `next: #N …` → phase 4.
- `in flight: … (stale …)` → `LANES park <N> "<where the branch stopped against its AFK plan comment>"`, then phase 6.
- `next: none` → phase 6.

**Exit gate:** one issue number, or the decision to do housekeeping.

## 4. Build

1. `LANES claim <N>` rechecks eligibility, labels `state:claimed`, moves the issue to 03 Plan and prints a fresh worktree from the base branch. Work only in that worktree.
2. Invoke `plan`; it posts the `AFK plan` comment and moves the issue to 04 Execute.
3. Invoke `tdd`; iterate with the project's targeted test command.
4. Update the user-facing docs the project's rules tie to the change, in the same branch.
5. `LANES scope <N>` passes; then the project's full verification gate passes once.
6. Commit, then run one isolated worker with fresh context that invokes `review` on the branch's diff against the base, given only the issue and its acceptance criteria. Verify each Blocker and Major against the code, fix the real ones through `tdd`, and pass the gate again. Run at most two review rounds.

Park with `LANES park <N> "<one question, the options, a recommendation>"` (pushing the branch when it holds useful work) whenever the issue is ambiguous or contradicts project rules, needs a path outside its scope packet or a protected path, needs an undecided product or model choice, stays red after two honest fix attempts, still has a verified Blocker after the second review round, or needs credentials, settings or a device.

**Exit gate:** green verification, an in-scope diff and a review with no open Blocker, or a parked issue.

## 5. Publish

1. `git push -u origin HEAD`.
2. `gh pr create --title "<type>(<area>): <outcome>" --body-file <file>` following the project's PR template, with `Closes #<N>`, a link to the plan comment and the review's verdict; ready for review. The issue moves to 05 Review.
3. `LANES release <N>`.
4. `LANES automerge <pr>` unless the issue asks for owner review before merge. It merges (or queues, updating a branch that fell behind) only docs, tests and Dependabot minor or patch dependency changes and prints why anything else, including a major version update, waits.

**Exit gate:** a PR URL and its auto-merge verdict.

## 6. Housekeeping

Run when no issue was delivered this run, each step once:

1. For each open Dependabot PR: `LANES automerge <pr>`; when its checks fail, comment the failing excerpt.
2. Invoke `spec` to triage the issues `LANES next` lists as untriaged.

Keep to the queue: new work starts as an issue, not in a run. Name any follow-up you found in the output for the owner.

**Exit gate:** each step's printed result.

## 7. Close

Every run ends with:

1. Invoke `improve` for each issue in 07 Improve without a `Lessons` comment, and for this run's own friction.
2. `LANES tidy --apply`: removes AFK runs' own `afk-*` worktrees and branches once their PR is merged or closed; other sessions' checkouts, dirty ones and open PRs stay.
3. `LANES board --apply` when lanes.json names a project.

**Exit gate:** the lessons (or "no lessons") and both commands' printed result.

## Output

At most eight lines: base branch health and issues shipped, PRs tended, issue and PR (or "queue empty"), auto-merge verdict, anything parked with its question, follow-ups found, lessons with their target file, housekeeping counts.
