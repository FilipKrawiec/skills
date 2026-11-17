---
name: deliver
description: Use when delivering an issue or epic through drive, dispatching the agent drive names, passing an agent's hand-back to drive, or building or fixing an issue as the implementer from a drive brief.
allowed-tools: Skill Read Write Edit Bash Agent
---

# Deliver

`drive` handles mechanical changes; agents judge and `devops` judges risk (`review`'s `references/risk.md`). `<cli>` is `node <this-skill-directory>/../../scripts/workflow.mjs`.

Run one plain command per Bash call. Use `drive` and `wait`, never `gh` or polling, for labels, claims, cards, auto-merge, CI.

Branch on your role, first match wins:

- a drive brief started you as the implementer: step 2;
- otherwise you dispatch in the owner's session: step 1.

## 1. Dispatch

Run `<cli> drive <issue|epic>`, or `<cli> drive --next` to take the next ready issue or epic. Act on its JSON instruction, first match wins:

- `agent` with `session: "subagent"`: verify the host matches `host`. Dispatch the named agent, model, effort and responsibility with the host's native subagent facility, a unique task name if required. If the host cannot confirm model or effort, stop. Start it with the prompt `Follow your brief at <brief> and return its hand-back.`; with `resume`, resume the implementer. If its hand-back is missing or malformed, stop. Write its hand-back, adding the host's reported usage as a `usage:` line when it has none, under `<cli> scratch`, then run `<cli> drive <issue> --hand-back <file>`.
- `agent` with `session: "native"`: follow [native session](references/native-session.md).
- `agent` with `session: "separate"` (reviewer): run its `command` from `cwd` as one background Bash call. Never review or approve in this session, which wrote the PR. When it exits, run `<cli> drive <issue>`. If host, model, effort or hand-back is unverifiable, stop and report; never substitute models or bypass review.
- `wait`: run its `command` as one background Bash call; when it exits, run `drive` again. After a wait `until: "merged"` exits 0, run `<cli> wait <pr> --until base` the same way: exit 1 means the base is red at the merge commit. Never sleep or poll.
- `owner`: tell the owner its reason and `url`, then end the turn.
- `blocked`: report the cause; end the turn.
- `done`: report it. For an epic, rerun `drive <epic>` until the epic is done.

Drive each `alsoReady` slice alone. Report a result's `consolidated` merge. Background each `alsoWaiting` command. Start only drive's agents; edit no files; run no `gh`. After interruption, run `drive` again.

**Exit gate:** `done` for the issue or epic, or an `owner` or `blocked` step reported.

## 2. Implement

Work only in your brief's worktree, on its task.

- Work test-first through `tdd`: run the focused test you changed while you work, never the full suite.
- When the change is complete, run the brief's `check` once. Rerun only after fixing a failure.
- Commit only with the brief's `commit` command, or leave the changes and name `commit` and `paths` in the hand-back; drive commits and pushes.
- Fix only failing checks and Blocker and Important findings from `review-context`. Nits never block; leave them open. Dispute one with `status: disputed` plus `note`; `done` without a commit reruns the fix. Only the Reviewer handles threads.
- Resolve base conflicts with `git merge --no-ff --no-commit origin/<base>`, then the brief's `commit` command.
- Use the project's documented capture command; no native build is needed unless documented. Capture after the UI settles.
- Add no capability, option or refactor the issue did not ask for.
- Never push, open, label, ready or merge a PR, never start an agent and never print a token.

Hand back the brief's format, 6 lines at most:

```text
status: done
commit: fix(drive): keep the claim when the push fails
paths: src/drive.mjs test/drive.test.mjs
check: pass
note: drive releases the claim only after the push succeeds
```

Use `status: replan` when the issue contradicts the code or splits at a logical seam, `status: blocked` when a person must act.

**Exit gate:** `check` passed and the hand-back returned, or `replan` or `blocked` with its reason.

## Rules that stay

- Every PR needs an issue; `spec` files it.
- Never act on GitHub as the owner: GitHub refuses an approval from a PR's author or last pusher. `push` acts as the implementer, `review-post` as the Reviewer.
- Never rebase or force-push a branch with an open PR: it detaches review threads. Merge the base instead.
- A merge that publishes to production goes through `release` first: with `github.publishOnMerge` set, `drive` returns an `owner` step and `pr auto-merge` refuses until the owner approves the head. Invoke `release` for that approval and gates. `pr auto-merge` also keeps every `review:owner` hold.
- Red base after merge: report the run and culprit; never fix forward or revert without authority.
- Merged is not shipped: deployment, acceptance and `## Shipped #M` evidence belong to `release` and `milestone`.

## Setup

Read [setup.md](references/setup.md) when setting up a repository for `drive`. Read [epic-closure.md](references/epic-closure.md) for epic closure evidence and follow-ups.

## Output

At most 5 lines: **Summary:** issue or epic, PR and state. **Decision:** the owner step with its link, or "Nothing needed."
