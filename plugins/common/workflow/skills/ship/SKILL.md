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
gh run list --branch <base> --event push --limit 200 \
  --json databaseId,headSha,displayTitle,conclusion,status,workflowName,url
```

Ignore cancelled runs, and count as cancelled each failed run that has jobs, none of which ran a step (`gh run view <databaseId> --json jobs`: every job's `steps` is empty), as when no runner picked it up. Check this for each failed run that the state and the culprit search below rely on. Keep each run's `url`: phase 3 links the head's run from this listing, never a second query. The head is the newest commit on `origin/<base>` that has runs; commits after it had none, so CI skipped them. Judge each workflow by its own runs, newest first: it is red when its newest completed run failed, pending while its newest run is not completed, and green otherwise. A workflow that only runs for some paths keeps the state of its newest run, even when that run is on a commit older than the head. The base is red when any workflow is red, else pending when any is pending, else green.

- Base green → phase 3.
- Base pending, or no runs at all → nothing to confirm yet; report it.
- Base red → for each red workflow, take from that workflow's own runs the newest green commit G and the oldest red commit R after it. The culprit is known only when `git log --first-parent --format=%H <G>..<R>` lists exactly R; otherwise report it as ambiguous with that range. With no green run of that workflow, report its culprit as unknown and stop. `gh pr list --state merged --search <sha> --json number,headRefName,closingIssuesReferences` finds the culprit's PR; it is an AFK merge when `headRefName` starts with `<branchPrefix>`. Then phase 2.

**Exit gate:** the base state at its head, for red the failing checks and the culprit or the ambiguous range, and no card in Review without an open PR.

## 2. Respond

When an AFK merge broke the base branch and `gh pr list --head <branchPrefix>revert-<short-sha>` shows no open PR:

1. `git worktree add <root>/.worktrees/afk-revert-<short-sha> -b <branchPrefix>revert-<short-sha> origin/<base>` (`<root>` as in board.md); in it run `git revert --no-edit <sha>`, then pass the project's full verification gate (its own command, e.g. `python3 scripts/project-verify.py verify` or `just verify`).
2. Push and open a PR titled `revert: <subject>` whose body names the failing checks, then report it through board.md's Merge gate.
3. Reopen the issue the reverted PR closed (`gh issue reopen`) and park it with the failing checks, the revert PR and a recommendation for the retry: it is claimed again once the owner re-applies `lane:afk`.

Any other red base branch belongs to the owner: report the failing checks and the culprit or range. A fix forward is new work: name it as a follow-up for the owner.

**Exit gate:** a revert PR, or a report naming the failing checks and the culprit, the ambiguous range or `unknown`.

## 3. Confirm

The base is green, so every merge up to its head shipped. For each issue in 06 Ship ([board.md](../../references/board.md)'s States) whose PR #M has its merge commit in the head's history (`gh pr view <M> --json mergeCommit`, then `git merge-base --is-ancestor <sha> <head>`), remove any `state:` label it still has (a closed issue keeps none), then comment `## Shipped #M`, the head commit and its CI run link. A reverted merge reopened its issue and its retry is the newer PR, so only the retry is ever confirmed.

Then close as completed (`gh issue close <N> --reason completed`) each open `type:epic` issue that has sub-issues, all closed and none in 06 Ship (sub-issues as in board.md's Epics); its card moves to Done.

**Exit gate:** the issues confirmed, each with no `state:` label, and the epics closed, or none.

## Output

In [board.md](../../references/board.md)'s Reporting to the owner form. Summary, one line: base state at its head, the revert PR or the culprit (range or `unknown`), the issues confirmed shipped and the epics closed. Decision: the revert PR to merge, or the red base with its failing checks and culprit, or "Nothing needed."
