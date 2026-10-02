---
name: ship
description: Use when a change has merged (phase 06 Ship), for checking base-branch CI, reverting the merge that broke it, escalating deeper failures to planning, or confirming merged issues shipped.
allowed-tools: Read Bash(python3:*,git:*,gh:*,just:*)
---

# Ship (06)

Merge is not the end of delivery. Watch the base branch after merges, fix what is bounded, and turn the rest into planned work. The owner keeps merge, release and deploy authority.

`LANES` means `python3 <the afk skill's directory>/scripts/lanes.py`. Every write command is a dry run without `--apply`. `LANES phase <N>` names this skill while a merged issue is in 06 Ship.

## 1. Observe

Run `LANES health`. It reads CI on the base branch's recent commits and prints one of:

- `base: green` → phase 3.
- `base: pending` or `base: none` → nothing to confirm yet; report it.
- `base: red …; failing: <checks>` with `broken by: <sha> <subject> (AFK | not AFK)` or `unknown` → phase 2.

**Exit gate:** the printed state.

## 2. Respond

When an AFK merge broke the base branch and `gh pr list --head <branchPrefix>revert-<short-sha>` shows no open PR:

1. Make a worktree from the base branch on `<branchPrefix>revert-<short-sha>` in `<worktrees>/afk-revert-<short-sha>`, run `git revert --no-edit <sha>`, then pass the full verification gate.
2. Push and open a PR titled `revert: <subject>` whose body names the failing checks.
3. Reopen the issue the reverted PR closed (`gh issue reopen`) and `LANES park` it with the failing checks, the revert PR and a recommendation for the retry: it returns to 03 Plan once the owner re-applies `lane:afk`.

Any other red base branch belongs to the owner: report the failing checks and the culprit. Attended sessions may fix it forward through `tdd` when the cause is bounded and the owner agrees.

**Exit gate:** a revert PR, or a report naming the failing checks and the culprit.

## 3. Confirm

Run `LANES health --apply` on a green base branch. It labels `state:shipped` each planned issue closed before the newest green commit, moving it to 07 Improve.

**Exit gate:** the printed `shipped:` lines, or none.

## Output

One line: base state at its head, the revert PR or the culprit, and the issues confirmed shipped.
