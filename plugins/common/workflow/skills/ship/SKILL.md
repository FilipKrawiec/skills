---
name: ship
description: Use when a change has merged (06 Ship), to check base-branch CI, revert the merge that broke it and confirm merged issues shipped.
allowed-tools: Skill Read Bash(python3:*,git:*,gh:*,just:*)
---

# Ship (06)

Revert only AFK merges. `<base>` and `<branchPrefix>` come from `.github/lanes.json` (defaults `main`, `agent/afk-`). With a board (lanes.json `project`), move cards with `gh project item-edit`.

## 1. Observe

With a board, move Review cards whose open issue has no open PR to Todo. Then read push runs on `<base>`: `gh run list --branch <base> --event push --limit 200`.

- Ignore cancelled runs and failed runs whose jobs all have empty `steps`.
- Judge each workflow by its own newest run, even on an older commit: red if the newest completed one failed, pending if the newest is incomplete, else green. Base: red if any is red, else pending if any is, else green. Green → phase 3; pending or no runs → report only.
- Red → per red workflow, newest green commit G, oldest red R after it. The culprit is R only when `git log --first-parent <G>..<R>` lists exactly R; else the range is ambiguous; no green run → `unknown`. It is AFK when its PR's head branch starts with `<branchPrefix>`.

**Exit gate:** base state; for red, failing checks and culprit.

## 2. Respond

When an AFK merge broke the base and no open PR has head `<branchPrefix>revert-<short-sha>`:

1. In a new worktree on that branch from `origin/<base>`, `git revert --no-edit <sha>` and pass full verification.
2. Invoke `vcs` to open the revert PR `revert: <subject>` and make it ready to merge.
3. Reopen its issue and park it: replace `lane:afk` and `state:*` with `lane:owner`; comment the failing checks, the revert PR and a retry recommendation in ≤ 5 lines.

Otherwise report it to the owner, naming a fix forward as a follow-up.

**Exit gate:** a revert PR, or that report.

## 3. Confirm

For each issue closed as completed in the last 30 days whose newest merged closing PR #M has no `## Shipped #M` comment, and whose merge commit is an ancestor of the base head: remove `state:` labels; comment `## Shipped #M` with the head commit and run link.

Close each open `type:epic` whose sub-issues are all closed with a `## Shipped` comment.

**Exit gate:** issues confirmed, epics closed, or none.

## Output

≤ 5 lines. **Summary**, one line: base state, revert PR or culprit, issues confirmed, epics closed, linked. **Decision:** revert PR to merge, red base, or "Nothing needed."
