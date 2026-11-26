---
name: deliver
description: Use when delivering an issue or epic through drive, dispatching the agent drive names, passing an agent's hand-back to drive, or building or fixing an issue as the implementer from a drive brief.
allowed-tools: Skill Read Write Edit Bash Agent
---

# Deliver

`drive` handles mechanical changes; agents judge, `devops` judges risk (`review`'s `references/risk.md`). `<cli>` is `node <this-skill-directory>/../../scripts/workflow.mjs`.

Run one plain command per Bash call. Use `drive` and `wait`, never `gh`.

Branch on your role, first match wins:

- a drive brief started you as the implementer: step 2 (the implementer agent loads only the reference);
- otherwise you dispatch in the owner's session: step 1.

## 1. Dispatch

Run `<cli> drive <issue|epic>`, or `<cli> drive --next` (an epic is the unit; ready work: base-red, started, `type:bug`, rest; base-red and orphan issues run alone). Act on its JSON instruction, first match wins:

- `agent` with `session: "subagent"`: verify the host matches `host`. Dispatch the named agent, model, effort and responsibility with the host's subagent facility. If the host cannot confirm model or effort, stop. Start it with the prompt `Follow your brief at <brief> and return its hand-back.`; with `resume`, resume the implementer. If its hand-back is missing or malformed, stop. Write its hand-back, adding the host's reported usage as a `usage:` line (`in=N out=N cache=N cost=USD model=M`) when it has none (else per [usage](references/usage.md)), under `<cli> scratch`, then run `<cli> drive <issue> --hand-back <file>`.
- `agent` with `session: "native"`: follow [native session](references/native-session.md).
- `agent` with `session: "separate"` (reviewer): run its `command` from `cwd` as one background Bash call. Never review or approve in this session. When it exits, run `<cli> drive <issue>`. If host, model, effort or hand-back is unverifiable, stop and report; never substitute models or bypass review.
- `wait`: run its `command` as one background Bash call; never sleep or poll. When it exits, run `drive` again. After a wait `until: "merged"` exits 0, run `<cli> wait <pr> --until base` the same way: exit 1 means the base is red.
- `owner`: tell the owner its reason and `url`, then end the turn. `drive` has @-mentioned the owner on the "Owner inbox" issue.
- `blocked`: report the cause; end the turn.
- `done`: report it. For an epic, or a slice with `continue: drive <epic>`, rerun that until the epic is done.

An approved epic with no slices first gets the design pass: the planner (`design` mode) posts a design note on the epic, the Reviewer (`design-gate`, a separate session like any review) gates it, and a `changes` verdict sends the planner back to revise; `slice` runs only once it is approved, and no step of the pass is an owner step.

Drive each `alsoReady` slice alone. Report a result's `consolidated` merge. Background each `alsoWaiting` command. Start only drive's agents; edit no files; run no `gh`; rerun `drive` after interruption.

**Exit gate:** `done` for the issue or epic, or an `owner` or `blocked` step reported.

## 2. Implement

Read [implementer.md](references/implementer.md); a drive brief names its absolute path first.

**Exit gate:** `check` passed and the hand-back returned, or `replan` or `blocked` with its reason.

## Session logs

`drive` comments once per brief `Session:` id with its transcript gist, never blocking: [session-logs](references/session-logs.md).

## Rules that stay

- Every PR needs an issue; `spec` files it.
- The owner is asked at three gates only: production release, force-push to a protected branch, and credential or permission changes. Everything else `drive` does, including paid bench runs within the configured cap, epic approval from a recorded card decision, gate baseline retags through a reviewed PR and delivery host and model changes, runs under `init`'s standing `autoMode.allow` rule; never ask the owner to type or paste a line for it.
- Never act on GitHub as the owner: GitHub refuses an approval from a PR's author or last pusher. `push` acts as the implementer, `review-post` as the Reviewer.
- Never rebase or force-push an open PR's branch; merge the base.
- A merge that publishes to production goes through `release` first: with `github.publishOnMerge` set, `drive` returns an `owner` step and `pr auto-merge` refuses until the owner approves the head. `pr auto-merge` also keeps every `review:owner` hold.
- Red base: report the run and culprit; never fix forward or revert unauthorised. `drive` files one main-red bug, takes it first, holds other auto-merges until green.
- Merged is not shipped: deployment, acceptance and `## Shipped #M` evidence belong to `release` and `milestone`.

## Setup

[setup.md](references/setup.md), [epic-closure.md](references/epic-closure.md), [runner.md](references/runner.md).

## Output

At most 5 lines: **Summary:** issue or epic, PR and state. **Decision:** the owner step with its link, or "Nothing needed."
