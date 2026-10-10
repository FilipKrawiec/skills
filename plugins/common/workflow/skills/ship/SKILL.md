---
name: ship
description: Use when a change has merged (06 Ship), to check base-branch CI, revert the merge that broke it and confirm merged issues shipped.
allowed-tools: Skill Read Bash(python3:*,git:*,gh:*,just:*)
---

# Ship (06)

Revert only AFK merges. `<base>` and `<branchPrefix>` come from `.github/lanes.json` (defaults `main`, `agent/afk-`); `<root>` is the main checkout. With a board (lanes.json `project`), move cards with `gh project item-edit`.

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
2. Invoke `vcs` to open a PR `revert: <subject>` naming the failing checks, and to make it ready to merge.
3. `gh issue reopen` its issue and park it: replace `lane:afk` and `state:*` with `lane:owner`, and comment the failing checks, the revert PR and a retry recommendation in ≤ 5 lines.

Otherwise report it to the owner, naming a fix forward as a follow-up.

**Exit gate:** a revert PR, or that report.

## 3. Confirm

For each issue closed as completed in the last 30 days whose newest merged closing PR #M has no `## Shipped #M` comment yet, and #M's merge commit is in the head's history (`gh pr view <M> --json mergeCommit`, then `git merge-base --is-ancestor <sha> <head>`): remove `state:` labels; comment `## Shipped #M` with the head commit and run `url`.

Close each open `type:epic` whose sub-issues are all closed, each with a `## Shipped` comment: `gh issue close <N> --reason completed`.

**Exit gate:** issues confirmed, epics closed, or none.

## Output

≤ 5 lines. **Summary**, one line: base state, revert PR or culprit, issues confirmed, epics closed, linked. **Decision:** revert PR to merge, red base, or "Nothing needed."
