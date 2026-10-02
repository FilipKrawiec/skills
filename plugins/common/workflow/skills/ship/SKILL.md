---
name: ship
description: Use when a change has merged (06 Ship), to check base-branch CI, revert the merge that broke it and confirm merged issues shipped.
allowed-tools: Read Bash(python3:*,git:*,gh:*,just:*)
---

# Ship (06)

Merge is not the end of delivery. Watch the base branch after merges, fix what is bounded, and turn the rest into planned work. The owner keeps merge, release and deploy authority.

`<base>` and `<branchPrefix>` come from `.github/lanes.json` (defaults `main` and `agent/afk-`). Card moves and parking follow [board.md](../../references/board.md).

**With the owner:** every phase; the owner may choose a fix forward over a revert. **Unattended:** the same, reverting AFK merges only.

## 1. Observe

When the project has a board, move to Todo each card in Review whose issue is open with no open PR (its PR closed unmerged). Then read the base branch's CI:

```bash
git fetch origin <base>
gh run list --branch <base> --event push --limit 50 \
  --json headSha,displayTitle,conclusion,status,workflowName
```

Ignore cancelled runs. Group the rest by `headSha`; a commit is red when any of its runs failed, pending while any is not completed, and green otherwise. The head is the newest commit on `origin/<base>` that has runs; commits after it had none, so CI skipped them.

- Head green → phase 3.
- Head pending, or no runs at all → nothing to confirm yet; report it.
- Head red → find the newest green commit G and the oldest red commit R after it. The culprit is known only when `git log --first-parent --format=%H <G>..<R>` lists exactly R; otherwise report it as ambiguous with that range. With no green commit among the runs, report the culprit as unknown and stop. `gh pr list --state merged --search <sha> --json number,headRefName,closingIssuesReferences` finds the culprit's PR; it is an AFK merge when `headRefName` starts with `<branchPrefix>`. Then phase 2.

**Exit gate:** the base state at its head, for red the failing checks and the culprit or the ambiguous range, and no card in Review without an open PR.

## 2. Respond

When an AFK merge broke the base branch and `gh pr list --head <branchPrefix>revert-<short-sha>` shows no open PR:

1. `git worktree add <root>/.worktrees/afk-revert-<short-sha> -b <branchPrefix>revert-<short-sha> origin/<base>` (`<root>` as in board.md); in it run `git revert --no-edit <sha>`, then pass the project's full verification gate (its own command, e.g. `python3 scripts/project-verify.py verify` or `just verify`).
2. Push and open a PR titled `revert: <subject>` whose body names the failing checks.
3. Reopen the issue the reverted PR closed (`gh issue reopen`) and park it with the failing checks, the revert PR and a recommendation for the retry: it is claimed again once the owner re-applies `lane:afk`.

Any other red base branch belongs to the owner: report the failing checks and the culprit or range. A fix forward is new work: name it as a follow-up for the owner.

**Exit gate:** a revert PR, or a report naming the failing checks and the culprit, the ambiguous range or `unknown`.

## 3. Confirm

The head is green, so every merge up to it shipped. For each issue in 06 Ship ([board.md](../../references/board.md)'s States) whose PR #M has its merge commit in the head's history (`git merge-base --is-ancestor <mergeCommit> <head>`) and that is still closed as completed, comment `## Shipped #M`, then the head commit and its CI run link. A reverted merge reopened its issue, so it stays unconfirmed until its retry merges.

**Exit gate:** the issues confirmed, or none.

## Output

One line: base state at its head, the revert PR or the culprit (range or `unknown`), and the issues confirmed shipped.
