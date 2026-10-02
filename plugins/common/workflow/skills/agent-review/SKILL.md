---
name: agent-review
description: Use when running the scheduled automated reviewer of a repository whose `.github/lanes.json` turns on `agentReview`, reviewing each open PR once per head commit, handing critical PRs to the owner, merging reviewed AFK PRs and waking the AFK runner.
allowed-tools: Skill Read Bash(python3:*,git:*,gh:*)
---

# Agent Review

One pass reviews every open PR at its head commit, hands to the owner what needs the owner, merges the AFK PRs it judged safe, and wakes the AFK runner. The owner keeps merge authority over everything else. The runner (the `afk` skill) fixes findings on its own PRs; each PR gets at most lanes.json's `reviewRounds` reviews (default 3).

`LANES` means `python3 <the afk skill's directory>/scripts/lanes.py`. GitHub writes are limited to: one review per PR per head commit, the `review:owner` label on PRs, and `LANES merge-reviewed`.

## 1. Collect

List open PRs, drafts included, except Dependabot's. For each, read its reviews and find agent reviews by their first line, `<!-- agent-review sha=<HEAD> round=<N> verdict=<V> -->` (plus any legacy marker the caller names).

- An agent review at the current head → skip to phase 4.
- The newest agent review used the last round → skip.
- Otherwise its round is 1 plus the count of earlier agent reviews.

**Exit gate:** a list of PRs to review, oldest updated first, at most 4.

## 2. Review

Run one isolated worker per PR, in parallel, at medium reasoning when the host offers a choice. Each checks out the PR head in a scratch worktree, reads the acceptance criteria of the issue the PR closes, runs `review`'s two axes on the PR's own diff against its base, and checks that earlier blocking findings are fixed. Workers report a verdict and findings with `file:line` and a failure scenario, post nothing, and quote no copyrighted or personal content from the repository.

Verify every blocking finding against the code yourself, then re-read the PR's head SHA; a moved head goes back to phase 1 next pass.

**Exit gate:** verified findings for each PR at an unchanged head.

## 3. Post

Decide criticality with [critical.md](references/critical.md). Pick the verdict:

| Verdict | When | Marker `verdict=` | `review:owner` |
| --- | --- | --- | --- |
| Ready to merge | No finding to fix; not critical. | `ready` | removed on an AFK branch, added on any other branch (the owner merges it) |
| Ready for the owner's review | No blocking finding; critical. Name why. | `owner` | added |
| Needs fixes first | Blocking findings (`review`'s `REQUEST_CHANGES`), round below the last. Say whether it is critical. | `fixes` | removed |
| Needs the owner: review rounds used | Blocking findings in the last round. | `rounds` | added |

Post one review with event COMMENT on the head commit: blocking findings as inline comments, and a body of the marker line, the verdict, the findings (blocking first, optional ones marked optional, each with `file:line` and its failure scenario) and the host's attribution footer. Then set the label, writing back the PR's full label set.

**Exit gate:** each reviewed PR shows the new review and the right label.

## 4. Merge

For each open PR on lanes.json's `branchPrefix` whose newest agent review says `ready` at its head, run `LANES merge-reviewed <pr>`. It merges only an open, ready AFK PR into the base, with no protected path, no `review:owner`, no review requesting changes, no newer comment from a person, and a clean merge state; otherwise it prints why it waits. A host without the GitHub CLI applies the same checks with its own GitHub tools and squash-merges at the reviewed head. After a merge, comment one line on the PR naming the round, with the attribution footer. Report a failed merge once.

**Exit gate:** each candidate's printed result.

## 5. Wake the runner

Wake the AFK runner once, as the caller describes, with instructions that start "Scheduled AFK run." and name the AFK PRs that need fixes, have failing checks or conflict. When the runner's host is offline, count consecutive offline passes and tell the owner once at three.

When the runner reports during a pass, review the PRs it names with phases 2–4 and fold its parked issues, follow-ups and lessons into phase 6.

**Exit gate:** the runner woke, or the offline count.

## 6. Report

Send the owner one short message only when something needs them or something shipped, in this order: PRs ready for or needing the owner (linked, with the reason); issues the runner parked (question and recommendation); follow-ups the runner found (each needing the owner's yes to become an issue); lessons, each with the file it should change and the proposed wording: the runner's, plus any finding this reviewer raised on two or more PRs, which belongs in a rule rather than another review; one line naming PRs merged since the last report. Repeat an item only when it changed. Remove the scratch worktrees.

**Exit gate:** the message sent, or nothing to report, and no worktree left.
