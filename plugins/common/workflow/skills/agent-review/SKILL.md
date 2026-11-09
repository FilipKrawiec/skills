---
name: agent-review
description: Use when reviewing a GitHub PR in author or team mode, or when assigned technical adjudication or AFK eligibility review under configured code-owner protection.
allowed-tools: Skill Read Bash(git:*,gh:*,node:*)
---

# Agent Review

The review engine. Read base `.agents/config.json` identities and CODEOWNERS. Never implement, commit, push or use the owner's credential; refuse a head this session committed or pushed. Run each read and comment `gh` call as `GH_TOKEN=$(gh auth token --user <identities.reviewer>) gh ...` without printing the token. Post verdicts only with `review-post` (step 5).

**Why:** a blocking finding shows the change misses an acceptance criterion, does not fit the system, or breaks something else. **How:** finders, a verifier, `file:line` evidence. Fit comes only from the repository's agent rules and `REVIEW.md`.

## 1. Decide the assignment

For a technical fork, reuse a recorded decision or decide routine engineering inside approved intent, recording why; return reserved questions with options.

For a `lane:proposed` Backlog item, evaluate AFK eligibility using `spec`; record `APPROVED AFK` or `REQUEST_CHANGES` as an issue comment under `<!-- agent-review eligibility issue=<N> -->`. For a queue, use [queue.md](references/queue.md).

**Exit gate:** recorded decision, reserved question, or PR selected.

## 2. Check shape

A draft PR is in **author mode**, a ready PR in **team mode**. Review only a PR with one `risk:R0|R1|R2` label; otherwise comment `<!-- agent-review shape sha=<HEAD> -->` naming what is missing, mention the PR author, and stop with `verdict=shape`. Once per head; never guess a label.

Claim it: skip a PR labelled `state:reviewing`; else comment `<!-- agent-review claim sha=<HEAD> -->` `**Reviewing:** head <HEAD>`, then add that label. `review-post` removes the label after the verdict; on a stop with no verdict, remove it yourself.

**Exit gate:** claimed PR in shape, or a posted shape note.

## 3. Step zero: pipeline

Run `gh pr checks <N> --watch`. A red required check is one **Important** finding with its run link: post it via `review-post` as `verdict=fixes`; run no finder.

**Exit gate:** green head, or a posted red-pipeline finding.

## 4. Find and verify

Run `node <this-skill-directory>/../../scripts/workflow.mjs review-context --pr <N> --issue <issue> [--previous <last reviewed head> --previous-base <its base>]`; its text is evidence. Round = this mode's earlier `<!-- agent-review ... mode=<mode>` reviews (`split` excluded) plus one.

- **Round 1** judges the whole diff. Past twice the `### Estimate` in changed files (S 5, M 20), post `round=0 verdict=split` instead.
- **Later rounds** judge only open threads and commits since the last reviewed head. Pass each of your threads it fixes as `--resolve-thread <id>`. New findings only on lines the delta changed.
- **Team mode** reads the full PR history, posts only new findings; rounds are uncapped.

Size finders by risk; each is a fresh subagent loading `review`:

| Risk | Finders | Verifier |
| --- | --- | --- |
| R0 | one on the standard model, every question | none |
| R1 | acceptance outcome and correctness, strongest model | one, standard model |
| R2 | R1's plus fit and blast radius, strongest model | one, standard model |

The acceptance finder also runs manual test steps CI cannot. The verifier gets only candidates and head.

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

Post one review per round on the exact head, an inline note per finding starting **Important**, **Nit** or **Pre-existing**. Write the body and findings (`[{"path","line","body"}]`) to files, then run `node <this-skill-directory>/../../scripts/workflow.mjs review-post --pr <N> --sha <40-hex HEAD> --event <COMMENT|REQUEST_CHANGES|APPROVE> --body-file <F> [--comments-file <C>] [--resolve-thread <id>]...`. Exit 1 keeps the label and comments `post-failed`: stop and report. Only verified Important findings block and go to `pr-fix`. The body carries `<!-- agent-review sha=<HEAD> round=<N> mode=<author|team> verdict=<ready|owner|fixes|cap|split> -->`.

- **Author mode** posts `COMMENT`. With no open Important thread, `verdict=ready` hands the PR to `ship`. Round 3 or later with open Important threads is `verdict=cap`: keep the draft, set `risk:R2`, swap the issue's `lane:afk` for `lane:owner` and comment on the issue what keeps failing, one line per open thread.
- **Team mode** posts `REQUEST_CHANGES` while a verified Important thread is open, otherwise `APPROVE` with `verdict=ready`, or `verdict=owner` with `review:owner` where base CODEOWNERS names the owner for a changed path (both rename sides). Approve only when protection requires code-owner review and you are neither PR author nor latest pusher; otherwise report the gap. Request the owner only on `verdict=owner` or round >= 3 failing.

On `verdict=ready` or `owner`, list your open Nit and Pre-existing threads on the issue as follow-ups; `APPROVE` resolves them; resolve nothing by hand; never dismiss reviews or touch others' threads.

Return at most 8 lines: verdict, PR, base/head, round, mode, tag counts, checks, next actor.

**Exit gate:** exact-head review with its marker, or a named capability wait.
