---
name: ship
description: Use when a change has merged (phase 06 Ship), for checking base-branch CI, reverting the merge that broke it, escalating deeper failures to planning, or confirming merged issues shipped.
allowed-tools: Read Bash(git:*,gh:*,just:*)
---

# Ship (06)

Merge is not the end of delivery. Watch the base branch after merges, fix what is bounded, and turn the rest into planned work. The owner keeps merge, release and deploy authority.

`<base>` and `<branchPrefix>` come from `.github/lanes.json` (defaults `main` and `agent/afk-`). Card moves and parking follow [board.md](../../references/board.md).

## 1. Observe

When the project has a board, move each card still in 05 Review whose issue closed as completed to 06 Ship. Then read the base branch's CI:

```bash
gh run list --branch <base> --event push --limit 20 \
  --json headSha,displayTitle,conclusion,status,workflowName
```

Ignore cancelled runs. Group the rest by `headSha`, newest first; a commit is red when any of its runs failed, pending while any is not completed, and green otherwise.

- Newest commit green → phase 3.
- Newest commit pending, or no runs → nothing to confirm yet; report it.
- Newest commit red → the culprit is the oldest red commit after the newest green one (`unknown` when no green commit is in range). `gh pr list --state merged --search <sha> --json number,headRefName,closingIssuesReferences` finds its PR; it is an AFK merge when `headRefName` starts with `<branchPrefix>`. Then phase 2.

**Exit gate:** the base state, and for red the failing checks and the culprit.

## 2. Respond

When an AFK merge broke the base branch and `gh pr list --head <branchPrefix>revert-<short-sha>` shows no open PR:

1. `git fetch origin <base>` and `git worktree add .worktrees/afk-revert-<short-sha> -b <branchPrefix>revert-<short-sha> origin/<base>`; in it run `git revert --no-edit <sha>`, then pass the full verification gate.
2. Push and open a PR titled `revert: <subject>` whose body names the failing checks.
3. Reopen the issue the reverted PR closed (`gh issue reopen`) and park it with the failing checks, the revert PR and a recommendation for the retry: it returns to 03 Plan once the owner re-applies `lane:afk`.

Any other red base branch belongs to the owner: report the failing checks and the culprit. Attended sessions may fix it forward through `tdd` when the cause is bounded and the owner agrees.

**Exit gate:** a revert PR, or a report naming the failing checks and the culprit.

## 3. Confirm

On a green base branch every merge before it shipped: move each card in 06 Ship to 07 Improve.

**Exit gate:** the issues moved, or none.

## Output

One line: base state at its head, the revert PR or the culprit, and the issues confirmed shipped.
