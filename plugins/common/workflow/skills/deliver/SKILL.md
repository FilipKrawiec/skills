---
name: deliver
description: Use when delivering an issue or epic through drive, dispatching the agent drive names, passing an agent's hand-back to drive, or building or fixing an issue as the implementer from a drive brief.
allowed-tools: Skill Read Write Edit Bash Agent
---

# Deliver

`drive` makes every mechanical change (claim, branch, commit, push, draft PR, risk, ready, auto-merge, cards, close, worktree removal); agents add judgment only. `<cli>` is `node <this-skill-directory>/../../scripts/workflow.mjs`.

Run one plain command per Bash call: no pipes, `;`, `&&` or `$()`. Never edit labels, claims, board cards or auto-merge, and never watch CI, with `gh` or by polling: `drive` and `wait` do that.

Branch on your role, first match wins:

- a drive brief started you as the implementer: step 2;
- otherwise you dispatch in the owner's session: step 1.

## 1. Dispatch

Run `<cli> drive <issue|epic>`, or `<cli> drive --next` to take the next ready issue or epic. It prints one JSON line. Act on exactly that instruction, first match wins:

- `agent` with `session: "subagent"`: start the named agent (general-purpose for improver) on its `model` with the prompt `Follow your brief at <brief>. Return at most 5 lines.`; with `resume`, resume the implementer. Write its unchanged hand-back under `<cli> scratch`, then run `<cli> drive <issue> --hand-back <file>`.
- `agent` with `session: "separate"` (reviewer): run its `command` from `cwd` as one background Bash call. Never review or approve in this session, which wrote the PR. When it exits, run `<cli> drive <issue>`.
- `wait`: run its `command` as one background Bash call; when it exits, run `drive` again. After a wait `until: "merged"` exits 0, run `<cli> wait <pr> --until base` the same way: exit 1 means the base is red at the merge commit. Never sleep or poll inside a turn.
- `owner`: tell the owner its reason and `url`, then end the turn.
- `blocked`: report the cause; end the turn.
- `done`: report it. For an epic, rerun `drive <epic>` until the epic is done.

An epic instruction may list `alsoReady` slices: drive each with its own `drive <slice>` call. Start no agent drive did not name; edit no project file; run no `gh`. After an interruption, run `drive` again: unchanged state repeats its instruction.

**Exit gate:** `done` for the issue or epic, or an `owner` or `blocked` step reported.

## 2. Implement

Work only in the worktree your brief names, doing only the brief's task.

- Work test-first through `tdd`: run the focused test you changed while you work, never the full suite.
- When the change is complete, run the brief's `check` (the project gate) once. Rerun it only after fixing a failure.
- Commit only with the brief's `commit` command, or leave the changes and name `commit` and `paths` in the hand-back; drive commits and pushes.
- Fix round: fix only the failing check and the Blocker and Important findings `review-context` lists. Nits never block; leave them. A finding you judge wrong stays open: give your evidence in `note`. Never resolve or reply to threads; the Reviewer resolves its own.
- A conflict with the base: run `git merge --no-ff --no-commit origin/<base>`, resolve, then commit with the brief's `commit` command.
- Add no capability, option or refactor the issue did not ask for.
- Never push, open, label, ready or merge a PR, never start an agent and never print a token.

Hand back the brief's format, at most 5 lines:

```text
status: done
commit: fix(drive): keep the claim when the push fails
paths: src/drive.mjs test/drive.test.mjs
check: pass
note: drive releases the claim only after the push succeeds
```

Use `status: replan` when the issue contradicts the code or splits at a logical seam, and `status: blocked` when a person must act.

**Exit gate:** `check` passed and the hand-back returned, or `replan` or `blocked` with its reason.

## Rules that stay

- No PR without an issue: `spec` files one first, under its epic.
- Never act on GitHub as the owner: GitHub refuses an approval from a PR's author or last pusher. `push` acts as the implementer, `review-post` as the Reviewer.
- Never rebase or force-push a branch with an open PR: it detaches review threads. Merge the base instead.
- A merge that publishes to production goes through `release` first: with `github.publishOnMerge` set, `drive` returns an `owner` step and `pr auto-merge` refuses until the owner approves the head. Invoke `release` for that approval and native gates. `pr auto-merge` also keeps every `review:owner` hold.
- A red base after a merge: report the failing run and the culprit (`git log --first-parent <green>..<red>` lists one merge) to the owner. Never fix forward or revert without their authority.
- Merged is not shipped: deployment, acceptance and `## Shipped #M` evidence belong to `release` and `milestone`.

## Setup

Read [setup.md](references/setup.md) when setting up a repository for `drive`.

## Output

At most 5 lines: **Summary:** issue or epic, PR and state. **Decision:** the owner step with its link, or "Nothing needed."
