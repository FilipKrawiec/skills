---
name: ship
description: Use when a change has merged (06 Ship), to check base-branch CI, revert the merge that broke it and confirm merged issues shipped.
allowed-tools: Read Bash(python3:*,git:*,gh:*,just:*)
---

# Ship (06)

Revert only AFK merges. Placeholders, card moves and parking follow [board.md](../../references/board.md).

## 1. Observe

With a board, move Review cards whose open issue has no open PR to Todo. Then:

```bash
git fetch origin <base>
gh run list --branch <base> --event push --limit 200 \
  --json databaseId,headSha,displayTitle,conclusion,status,workflowName,url
```

- Ignore cancelled runs and failed runs whose jobs all have empty `steps` (`gh run view <databaseId> --json jobs`).
- Head = newest commit on `origin/<base>` with runs.
- Judge each workflow by its own newest run, even on an older commit: red if the newest completed one failed, pending if the newest is incomplete, else green.
- Base: red if any is red, else pending if any is, else green. Green → phase 3; pending or no runs → report only.
- Red → per red workflow, newest green commit G, oldest red R after it. Culprit is R only when `git log --first-parent --format=%H <G>..<R>` lists exactly R, else the range is ambiguous; no green run → `unknown`. Its PR: `gh pr list --state merged --search <sha> --json number,headRefName,closingIssuesReferences`; AFK when `headRefName` starts with `<branchPrefix>`. Phase 2.

**Exit gate:** base state; for red, failing checks and culprit.

## 2. Respond

When an AFK merge broke the base and `gh pr list --head <branchPrefix>revert-<short-sha>` shows no open PR:

1. `git worktree add <root>/.worktrees/afk-revert-<short-sha> -b <branchPrefix>revert-<short-sha> origin/<base>`; there `git revert --no-edit <sha>`; pass the full verification gate.
2. Open a PR `revert: <subject>` naming the failing checks; run board.md's Merge gate.
3. `gh issue reopen` its issue; park it with the failing checks, revert PR and a retry recommendation.

Otherwise report it to the owner, naming a fix forward as a follow-up.

**Exit gate:** a revert PR, or that report.

## 3. Confirm

For each issue in 06 Ship whose PR #M's merge commit is in the head's history (`gh pr view <M> --json mergeCommit`, then `git merge-base --is-ancestor <sha> <head>`): remove `state:` labels; comment `## Shipped #M` with the head commit and run `url`.

Close each open `type:epic` whose sub-issues are all closed and none in 06 Ship: `gh issue close <N> --reason completed`.

**Exit gate:** issues confirmed, epics closed, or none.

## Output

board.md's Reporting to the owner form. Summary, one line: base state, revert PR or culprit, issues confirmed, epics closed. Decision: revert PR to merge, red base, or "Nothing needed."
