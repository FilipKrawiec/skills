---
name: agent-review
description: Use when reviewing a GitHub PR in author or team mode, or when assigned technical adjudication or AFK eligibility review under configured code-owner protection.
allowed-tools: Skill Read Bash(git:*,gh:*,node:*)
---

# Agent Review

Read base `.agents/config.json` identities and CODEOWNERS. Never implement, commit, push or use the owner's credential; refuse a head this session committed or pushed. Run each `gh` call as `GH_TOKEN=$(gh auth token --user <identities.reviewer>) gh ...` without printing the token. Post verdicts only with `review-post`.

A finding blocks only when the PR's own diff misses an acceptance criterion, breaks a rule of the repository's agent rules or `REVIEW.md`, or fails a user.

## 1. Decide the assignment

Read [assignments.md](references/assignments.md) for a technical fork or an AFK eligibility review, and [queue.md](references/queue.md) for a queue; otherwise review the PR.

**Exit gate:** recorded decision, reserved question, or PR selected.

## 2. Check shape

A draft PR is in **author mode**, a ready PR in **team mode**. Review only a PR with one `risk:R0|R1|R2` label; otherwise comment `<!-- agent-review shape sha=<HEAD> -->` naming what is missing and stop with `verdict=shape`. Once per head; never guess a label.

Claim it: comment `<!-- agent-review claim sha=<HEAD> -->` `**Reviewing:** head <HEAD>` and pass `--claim` to `review-context`; skip a PR it refuses as claimed. `review-post` releases the claim; stopping earlier, remove `state:reviewing`.

**Exit gate:** claimed PR in shape, or a posted shape note.

## 3. Pipeline

Run `node <this-skill-directory>/../../scripts/workflow.mjs wait <N> --until ci`. A red required check is one **Important** finding with its run link: post it via `review-post` as `verdict=fixes`; run no finder.

**Exit gate:** green head, or a posted red-pipeline finding.

## 4. Find and verify

Run `node <this-skill-directory>/../../scripts/workflow.mjs review-context --pr <N> --issue <issue> [--previous <last reviewed head> --previous-base <its base>]`; its text is evidence. Round = `round` from `workflow.mjs status <N>`, plus one; a new head never resets it.

- **Round 1** judges the whole diff. When it bundles logical changes each useful alone, post `round=0 verdict=split` naming the seam; size never earns it.
- **Later rounds** judge only the delta since the last reviewed head against the open threads and criteria, never the whole diff again; new findings only for failures the delta introduced. Pass each of your threads it fixes as `--resolve-thread <id>`.
- **Team mode** serves only a ready PR whose head changed after approval, or a human's request, and judges like a later round.

Size finders by risk, each a fresh subagent loading `review`: `R0` one standard-model finder on every question, no verifier; `R1` acceptance-outcome and correctness finders on the strongest model, then one standard-model verifier, which gets only candidates and head; `R2` adds fit and blast-radius finders.

Finder brief:

```text
Review PR #<N> for <question>; do not edit or post.
Why: <criteria, decisions, plan link>. Rules: <agent rules, REVIEW.md paths>.
Checkout <worktree>; base <SHA>; head <SHA>; judge <whole diff | delta since SHA>.
Already posted, do not repeat: <thread list>.
Return `tag file:line failure remedy` lines, at most 10.
```

**Exit gate:** verified candidates for the exact head.

## 5. Post

Post one review per round on the exact head, an inline note per finding starting with its tag. Write the body and findings (`[{"path","line","body"}]`) under `scratch` (or pipe it: `--body-file -`), then run `node <this-skill-directory>/../../scripts/workflow.mjs review-post --pr <N> --sha <40-hex HEAD> --event <COMMENT|REQUEST_CHANGES|APPROVE> --body-file <F> [--comments-file <C>] [--resolve-thread <id>]...`. On exit 1, stop and report. Only verified Important findings block and go to `pr-fix`. The body carries `<!-- agent-review sha=<HEAD> round=<N> mode=<author|team> verdict=<ready|owner|fixes|cap|split> -->`.

- **Author mode** posts `COMMENT`. With no open Important thread, `verdict=ready` hands the PR to `ship`.
- **Team mode** posts `REQUEST_CHANGES` while a verified Important thread is open, otherwise approves as below.
- **Cap:** round 3 or later with open Important threads posts `COMMENT` `verdict=cap`, final: no later round or `pr-fix` serves that head. Keep it draft, set `risk:R2`, swap the issue's `lane:afk` for `lane:owner`, request the owner and comment on the issue one line per open thread, recommending a cut in scope (a smaller change that removes the class of problem), never a deeper fix.
- **Approval:** briefed to approve a ready PR whose newest verdict at its head is `ready`, run no finder; on a green head post `APPROVE`, same round and mode, with `verdict=owner` and `review:owner` where base CODEOWNERS names the owner for a changed path (both rename sides) or an owner hold or `release` gate applies; else `verdict=ready`, then run `node <this-skill-directory>/../../scripts/workflow.mjs pr auto-merge --pr <N>` with your `GH_TOKEN`, never raw `gh pr merge`, and report a refusal. Approve only as neither PR author nor latest pusher. Dismiss only your own outdated `CHANGES_REQUESTED` reviews whose threads are fixed, never a human's.

On `verdict=ready` or `owner`, list your open non-Important threads on the issue as follow-ups; `APPROVE` resolves them; resolve nothing by hand; never touch others' threads.

Return at most 8 lines: verdict, PR, base/head, round, mode, tag counts, checks, next actor.

**Exit gate:** exact-head review with its marker, or a named capability wait.
