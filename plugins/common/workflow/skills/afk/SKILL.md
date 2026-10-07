---
name: afk
description: One unattended run of the delivery cycle for a repository with .github/lanes.json; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*)
---

# AFK

One run carries the delivery cycle while the owner is away: it checks what shipped, tends its own open PRs, then takes **at most one** owner-approved issue through 03 Plan, 04 Execute and 05 Review, parks it with a question, or does housekeeping. The plugin's guard hook enforces the owner's merge, release and settings authority.

Leave the checkout the run starts in exactly as it is; every build and fix happens in a worktree. Run only the commands this skill, the skills it invokes and [board.md](../../references/board.md) name; when their output leaves a question open, name it in the run's output, since an improvised command can raise a permission prompt that stops a run nobody is watching.

`LANES` means `python3 <this skill's directory>/scripts/lanes.py` (or the project's wrapper, e.g. `just lanes`): `next`, `scope`, `triage`, `merge`, `hold` and `blockers`. Claim, park, release, tidy and card moves are board.md's Issue steps.

Read [setup.md](references/setup.md) when the repository has no `.github/lanes.json`, or when scheduling unattended runs.

When the host lets a run or worker choose its reasoning level, use high for `spec` triage, medium for `plan`, `review` and `improve`, low for `tdd`, and the lowest for `ship`, tending and housekeeping; raise it for a step only when it fails twice.

## 1. Ship

Invoke `ship` for the base branch.

**Exit gate:** the base branch is green with shipped issues confirmed, reverted by an open PR, or reported.

## 2. Tend

For each open PR on a branch starting with lanes.json's `branchPrefix` whose issue is not parked (`state:parked` without `lane:afk`; when the owner re-applied `lane:afk`, remove `state:parked` and tend it), work in its worktree (recreate it from the branch when tidied) and run board.md's Merge gate. For an unanswered review that requests changes (a person's, or an automated reviewer's marked blocking), fix each finding, then run `LANES merge <pr>` to switch auto-merge back on.

Run the project's full verification gate before each push. Park the PR's issue when a finding needs a product decision or stays red after two honest fix attempts.

**Exit gate:** every own PR is green, conflict-free and has no unanswered blocking review, or its issue is parked.

## 3. Pick

While the base branch is red, go to phase 5. Otherwise run `LANES next`.

- `next: #N …` → phase 4.
- `in flight: … (stale …)` → park it with where the branch stopped against its `## Plan` comment, then phase 5.
- `next: none` → phase 5.

**Exit gate:** one issue number, or the decision to do housekeeping.

## 4. Deliver

Each skill's exit gate is the next step's entry.

1. **Claim** the issue phase 3 picked; read it, its linked decisions and the project's agent rules.
2. **03 Plan.** Invoke `plan`.
3. **04 Execute.** Invoke `tdd` for each plan step and commit each green slice per `vcs`. Update the docs the project's rules tie to the change. Pass `LANES scope <N>` and the full verification gate.
4. **05 Review.** Invoke `review` as two fresh-context workers (axes A and B) with only the issue and the diff; allow two rounds. Then board.md's Open PR step.

Park with one question, the options and a recommendation whenever the issue is ambiguous or contradicts project rules, needs a path outside its scope packet or a protected path, needs an undecided product or model choice, stays red after two honest fix attempts, still has a verified blocking finding after the second review round, or needs credentials, settings or a device. A stop condition holds only once its stated fact is verified: trace a crash or a red check to the call that raises it, and list in the park every fix found that keeps all criteria.

**Exit gate:** a PR URL with the `LANES merge` line, or a parked issue.

## 5. Housekeeping

Run when no issue was delivered this run, each step once:

1. For each open Dependabot PR: `LANES merge <pr>`; when its checks fail, comment the failing excerpt.
2. Invoke `spec` to triage the issues `LANES next` lists as untriaged.

New work starts as an issue, not in a run: name any follow-up in the output.

**Exit gate:** each step's printed result.

## 6. Close

1. Invoke `improve` for each issue in 07 Improve, and for this run's own friction.
2. Tidy AFK runs' own worktrees and branches.

**Exit gate:** a PR or the reason it stays a proposal for each lesson (or "no lessons"), and the worktrees removed.

## Output

In board.md's Reporting to the owner form. Summary lines, for items that changed: base branch health and issues shipped, PRs tended, issue and PR (or "queue empty"), the merge line, lesson PRs with their target file, housekeeping counts. Decision lines: anything parked with its question, follow-ups found, lessons that stay proposals.
