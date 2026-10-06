---
name: agent-review
description: One scheduled review pass over open PRs where lanes.json turns on agentReview; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Bash(python3:*,git:*,gh:*)
---

# Agent Review

One pass reviews every open PR at its head commit, hands the owner only the PRs that `LANES triage` or the review rounds send there, holds the PRs it finds blocking issues in and lets the rest merge, and wakes the AFK runner. A PR that matches no owner rule already auto-merges on green checks from its Open PR step, so a review is a check that can stop it, not the gate that lets it in. The runner (the `afk` skill) fixes findings on its own PRs; each PR gets at most lanes.json's `reviewRounds` reviews (default 3).

`LANES` means `python3 <the afk skill's directory>/scripts/lanes.py`. GitHub writes are limited to: one review per PR per head commit, replies on review threads and resolving the agent-written ones it verified fixed, the `review:owner` label on PRs, `LANES hold` and `LANES merge`.

A base branch that requires resolved conversations blocks a PR while any review thread is open, even with green checks, and GitHub reports only `BLOCKED`. Fixed findings whose threads stay open hand the owner a PR they can't merge, so every pass settles the threads it can.

## 1. Collect

List open PRs, drafts included, except Dependabot's. For each, read its reviews and find agent reviews by their first line, `<!-- agent-review sha=<HEAD> round=<N> verdict=<V> -->` (plus any legacy marker the caller names), and read its unresolved review threads (GraphQL `reviewThreads { isResolved }`; `gh pr view` doesn't list them).

- An agent review at the current head → skip to phase 4.
- The newest agent review used the last round → skip.
- Otherwise its round is 1 plus the count of earlier agent reviews.

**Exit gate:** a list of PRs to review, oldest updated first, at most 4.

## 2. Review

Run one isolated worker per PR, in parallel, at medium reasoning when the host offers a choice. Each checks out the PR head in a scratch worktree, reads the acceptance criteria of the issue the PR closes, runs `review`'s two axes on the PR's own diff against its base, and checks every unresolved review thread, whoever opened it (an earlier agent review, another bot, a person): fixed at the head, with the commit that fixed it, or still open, which makes it a blocking finding again. Workers report a verdict and findings with `file:line` and a failure scenario, post nothing, and quote no copyrighted or personal content from the repository.

Verify every blocking finding against the code yourself, then re-read the PR's head SHA; a moved head goes back to phase 1 next pass.

**Exit gate:** verified findings for each PR at an unchanged head.

## 3. Post

Run `LANES triage <pr>`. It prints `owner` with the owner rule the PR matched, `chore` or `reviewed`; the rules are a closed list of checks on the PR's data in [owner-rules.md](references/owner-rules.md), and a PR matching none lands without the owner. Pick the verdict:

| Verdict | When | Marker `verdict=` | `review:owner` |
| --- | --- | --- | --- |
| Ready to merge | No finding to fix and no open thread; triage did not print `owner`. | `ready` | removed |
| Ready for the owner's review | No blocking finding; triage printed `owner`. Quote its rule. | `owner` | added |
| Needs fixes first | Blocking findings (`review`'s `REQUEST_CHANGES`), round below the last. | `fixes` | removed |
| Needs the owner: review rounds used | Blocking findings in the last round. | `rounds` | added |

Post one review with event COMMENT on the head commit: blocking findings as inline comments, and a body of the marker line, the verdict, the findings (blocking first, optional ones marked optional, each with `file:line` and its failure scenario) and the host's attribution footer. When the verdict hands the owner a PR that changes what users see, the body links before and after captures of each named change, so the owner judges what they can see. Then set the label, writing back the PR's full label set, and for any verdict other than `ready` run `LANES hold <pr>`, which switches its auto-merge off.

Settle the unresolved threads: reply on each one the head fixes, naming the commit. Resolve it when its first comment is agent-written (it ends with the host's attribution footer); a person's thread stays for that person, and the review body names it. A thread that waits on an owner check (a device, a credential) stays open, and the verdict is `owner`, naming it.

**Exit gate:** each reviewed PR shows the new review and the right label, and every thread still open is named in its review body.

## 4. Merge

For each open PR whose newest agent review says `ready` at its head, run `LANES merge <pr>`. It merges an open, ready PR of this repository into the base, or switches its auto-merge back on, when no owner rule matches, no review requests changes, no person commented after the review and no thread is open; otherwise it prints why it waits. A host without the GitHub CLI applies the same checks with its own GitHub tools and squash-merges at the reviewed head. After a merge, comment one line on the PR naming the round, with the attribution footer. Report a failed merge once.

**Exit gate:** each candidate's printed result.

## 5. Wake the runner

Wake the AFK runner once, as the caller describes, with instructions that start "Scheduled AFK run." and name the AFK PRs that need fixes, have failing checks or conflict. When the runner's host is offline, count consecutive offline passes and tell the owner once at three.

When the runner reports during a pass, review the PRs it names with phases 2–4 and fold its parked issues, follow-ups and lessons into phase 6.

**Exit gate:** the runner woke, or the offline count.

## 6. Report

Send the owner one message in [board.md](../../references/board.md)'s Reporting to the owner form, only when something needs them or something shipped. Summary lines: PRs merged since the last report, in one line; the runner's lesson PRs. Decision lines, in this order: PRs ready for or needing the owner (linked, with the reason); issues the runner parked (question and recommendation); follow-ups the runner found (each needing the owner's yes to become an issue); any finding this reviewer raised on two or more PRs, which belongs in a rule rather than another review, with the file it should change, its proposed wording kept in the review that raised it and linked. Repeat an item only when it changed. Remove the scratch worktrees.

**Exit gate:** the message sent, or nothing to report, and no worktree left.
