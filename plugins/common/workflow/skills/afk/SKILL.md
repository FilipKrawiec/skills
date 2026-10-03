---
name: afk
description: One unattended run of the delivery cycle for a repository with .github/lanes.json; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*)
---

# AFK

One run carries the delivery cycle while the owner is away. It checks what already shipped, tends its own open PRs, then takes **at most one** owner-approved issue from 02 Spec through 03 Plan, 04 Execute and 05 Review, or parks it with a question, or does housekeeping. The owner holds merge, release and settings authority; the plugin's guard hook enforces it in projects with `.github/lanes.json`.

Leave the checkout a run starts in exactly as it is; it may hold the owner's work. Every build and fix happens in a worktree.

`LANES` below means `python3 <this skill's directory>/scripts/lanes.py` (or the project's wrapper, e.g. `just lanes`). It holds only the gates: `next`, `scope`, `automerge` and `merge-reviewed`. Claim, park, release, tidy and the few card moves the board doesn't make itself are the `gh` and `git` steps in [board.md](../../references/board.md).

Read [setup.md](references/setup.md) when the repository has no `.github/lanes.json`, or when scheduling unattended runs.

Spend reasoning where the risk is. When the host lets a run or worker choose its reasoning level, use high for `spec` triage, medium for `plan`, `review` and `improve`, low for `tdd`, and the lowest for `ship`, tending and housekeeping; raise it for a step only when it fails twice.

## 1. Ship

Invoke `ship` for the base branch.

**Exit gate:** the base branch is green with shipped issues confirmed, reverted by an open PR, or reported.

## 2. Tend

For each open PR on a branch starting with lanes.json's `branchPrefix` whose issue is not parked (`state:parked` without `lane:afk`; when the owner re-applied `lane:afk`, remove `state:parked` and tend it) and that needs work below, work in its worktree (recreate it from the branch when tidied):

1. A merge conflict → merge the base branch in and resolve it.
2. Failing checks → reproduce, fix and push.
3. An unanswered review that requests changes (a human's, or an automated reviewer's marked blocking) → fix each finding, push, then reply on its thread naming the fixing commit. `agent-review` resolves the agent-written threads once it verifies the fix; a person resolves their own.

Run the project's full verification gate before each push. Park the PR's issue when a finding needs a product decision or stays red after two honest fix attempts.

**Exit gate:** every own PR is green, conflict-free and has no unanswered blocking review, or its issue is parked.

## 3. Pick

While the base branch is red, go to phase 5. Otherwise run `LANES next`.

- `next: #N …` → phase 4.
- `in flight: … (stale …)` → park it with where the branch stopped against its `## Plan` comment, then phase 5.
- `next: none` → phase 5.

**Exit gate:** one issue number, or the decision to do housekeeping.

## 4. Deliver

Follow the phases in order; each skill's exit gate is the next step's entry.

1. **Claim** the issue phase 3 picked (card to In progress). Work only in its worktree; read the issue, its linked decisions and the project's agent rules.
2. **03 Plan.** Invoke `plan`. Its output is the `## Plan` comment.
3. **04 Execute.** Invoke `tdd` for each plan step and commit each green slice per `vcs`. Update the docs the project's rules tie to the change. Pass `LANES scope <N>` and the full verification gate.
4. **05 Review.** Invoke `review` as two fresh-context workers (its axes A and B) with only the issue and the diff; allow two rounds. Then the Open PR step, which releases the claim; linking the PR moves the card to Review.
5. **Merge gate.** `LANES automerge <pr>` unless the issue asks for owner review. It merges (or queues) only docs, tests and Dependabot minor or patch changes and prints why anything else waits.

Park with one question, the options and a recommendation whenever the issue is ambiguous or contradicts project rules, needs a path outside its scope packet or a protected path, needs an undecided product or model choice, stays red after two honest fix attempts, still has a verified blocking finding after the second review round, or needs credentials, settings or a device.

**Exit gate:** a PR URL with its auto-merge verdict, or a parked issue.

## 5. Housekeeping

Run when no issue was delivered this run, each step once:

1. For each open Dependabot PR: `LANES automerge <pr>`; when its checks fail, comment the failing excerpt.
2. Invoke `spec` to triage the issues `LANES next` lists as untriaged (issues created outside `spec`, which sets `lane:owner`).

Keep to the queue: new work starts as an issue, not in a run. Name any follow-up you found in the output for the owner.

**Exit gate:** each step's printed result.

## 6. Close

Every run ends with:

1. Invoke `improve` for each issue in 07 Improve, and for this run's own friction.
2. Tidy AFK runs' own worktrees and branches.

**Exit gate:** the lessons (or "no lessons") and the worktrees removed.

## Output

At most eight lines: base branch health and issues shipped, PRs tended, issue and PR (or "queue empty"), auto-merge verdict, anything parked with its question, follow-ups found, lessons with their target file, housekeeping counts.
