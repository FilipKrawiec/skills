---
name: pair
description: Use when the owner wants to work on a task with you in conversation, with or without an issue (such as a lane:owner issue), steering goal, approach and scope while subagents build and test each change.
allowed-tools: Skill Read Write Bash Agent
---

# Pair

You are the orchestrator: you talk with the owner and dispatch; an `implementer` subagent builds. `<cli>` is `node <this-skill-directory>/../../scripts/workflow.mjs`. Run one plain command per Bash call.

NEVER edit project files, run tests or run the gate yourself: a worker does it in the background while you keep talking, so the loop stays fast. Read code to answer the owner's questions.

Every reply to the owner has at most 5 lines: **Summary:** what changed or what you found. **Decision:** the one question you need answered, with your recommendation, or "Nothing needed."

## 1. Frame

Agree the goal, the approach and the scope (paths in, non-goals) with the owner. Ask one question at a time with your recommendation; the owner's words are decisions.

Branch on the issue, first match wins:

- the owner named an issue: read it and its comments; name what only the owner can do and what agents prepare;
- no issue: once the goal is agreed, invoke `spec` to file one story from the conversation, with a `scope` packet when the paths are known. Never ask the owner to write it.

The issue carries `lane:owner` while you pair (invoke `spec` to add it): `drive` and the runner then leave it alone. Open its worktree, with `N` the issue number and `<slug>` three to five words of its title:

```bash
git fetch origin
git worktree add -b N-<slug> <root>/.worktrees/N-<slug> origin/HEAD
```

`<root>` is the first path `git worktree list` prints. `drive` delivers a worktree on an `N-` branch as it is.

**Exit gate:** issue `N` has `lane:owner` and a worktree on branch `N-<slug>`.

## 2. Loop

For each change the owner asks for, write a brief under the directory `<cli> scratch` prints and start the `implementer` subagent in the background with `Follow your brief at <brief> and return its hand-back.` Run one worker per worktree at a time; fold requests that arrive during a run into the next brief.

The brief, whole:

```markdown
# Implementer brief: #N <issue title>

Mode: build (pairing; the owner steers in conversation).
Issue: <issue url>
Worktree: <path> (branch N-<slug>, base origin/HEAD)
PR: none yet; drive opens it

## Task

<the owner's request in their words, the agreed approach and scope>. Change only that, test-first with focused tests through `tdd`. Set cwd to <path> for every command. Run one plain command per Bash call.

## Commands you may run

- `<cli> check --worktree <path>`: the project gate. It must pass before you hand back `done`.
- `<cli> commit --message "<Conventional Commit subject>" -- <paths>`: commit before you hand back `done`.

Never push, open, label, ready or merge a PR, and never start an agent.

## Hand-back, at most 5 lines

status: done | replan | blocked
paths: <changed file paths>
check: pass | fail
note: <one line: what changed, or why replan or blocked>
```

When it returns, report its paths, check and note, then ask the next question. Take `replan` or `blocked` to the owner with your recommendation.

When the owner stops answering, start no new worker. Comment on the issue with the decisions so far, the branch and the open question, then end the turn; resume from that comment and the worktree. When the owner drops the work, comment why on the issue and leave it under `lane:owner`.

**Exit gate:** the owner says to ship, the last hand-back is `done` with `check: pass`, and `git status` in the worktree is clean.

## 3. Ship

1. Invoke `spec` to update the issue with the outcome, acceptance criteria and decisions as built, and remove `lane:owner`: the owner's part ended in this conversation.
2. Write this hand-back to a file under `<cli> scratch`:

   ```text
   status: done
   check: pass
   note: paired with the owner; <one line: what the branch delivers>
   ```

3. Run `<cli> drive N --hand-back <file>`, then invoke `deliver` to dispatch drive's instructions. Drive claims the issue, pushes the branch, opens the draft PR, assesses risk and runs the Reviewer; review fixes go to drive's implementer, never to this loop.

**Exit gate:** drive returned `done`, `owner` or `blocked`, reported to the owner.
