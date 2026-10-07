---
name: ship
description: Use when a change has merged (06 Ship), to check base-branch CI, revert the merge that broke it and confirm merged issues shipped.
allowed-tools: Read Bash(python3:*,git:*,gh:*,just:*)
---

# Ship (06)

Watch the base branch after merges, revert what an AFK merge broke, and confirm what shipped. The owner keeps merge, release and deploy authority. `<base>`, `<branchPrefix>`, `<root>`, card moves and parking follow [board.md](../../references/board.md).

**With the owner:** every phase; the owner may choose a fix forward over a revert. **Unattended:** the same, reverting AFK merges only.

## 1. Observe

With a board, move to Todo each card in Review whose issue is open with no open PR. Then read the base branch's CI:

```bash
git fetch origin <base>
gh run list --branch <base> --event push --limit 200 \
  --json databaseId,headSha,displayTitle,conclusion,status,workflowName,url
```

- Ignore cancelled runs, and count as cancelled each failed run whose jobs all ran no step (`gh run view <databaseId> --json jobs`: every `steps` is empty), checked for each failed run the state and culprit search rely on.
- Keep each run's `url`; phase 3 links the head's run from this listing.
- The head is the newest commit on `origin/<base>` that has runs.
- Judge each workflow by its own runs, newest first: red when its newest completed run failed, pending while its newest run is not completed, green otherwise. A path-filtered workflow keeps the state of its newest run, even on a commit older than the head.
- The base is red when any workflow is red, else pending when any is pending, else green.

Then:

- Green → phase 3.
- Pending, or no runs → report it; nothing to confirm yet.
- Red → for each red workflow, take from its own runs the newest green commit G and the oldest red commit R after it. The culprit is known only when `git log --first-parent --format=%H <G>..<R>` lists exactly R; otherwise report the range as ambiguous. With no green run of that workflow, report the culprit as unknown and stop. `gh pr list --state merged --search <sha> --json number,headRefName,closingIssuesReferences` finds the culprit's PR; it is an AFK merge when `headRefName` starts with `<branchPrefix>`. Then phase 2.

**Exit gate:** the base state at its head, for red the failing checks and the culprit or the ambiguous range, and no card in Review without an open PR.

## 2. Respond

When an AFK merge broke the base and `gh pr list --head <branchPrefix>revert-<short-sha>` shows no open PR:

1. `git worktree add <root>/.worktrees/afk-revert-<short-sha> -b <branchPrefix>revert-<short-sha> origin/<base>`; in it run `git revert --no-edit <sha>`, then pass the project's full verification gate.
2. Push and open a PR titled `revert: <subject>` whose body names the failing checks, then report it through board.md's Merge gate.
3. Reopen the issue the reverted PR closed (`gh issue reopen`) and park it with the failing checks, the revert PR and a recommendation for the retry.

Any other red base belongs to the owner: report the failing checks and the culprit or range, and name a fix forward as a follow-up.

**Exit gate:** a revert PR, or a report naming the failing checks and the culprit, the ambiguous range or `unknown`.

## 3. Confirm

The base is green, so every merge up to its head shipped. For each issue in 06 Ship whose PR #M has its merge commit in the head's history (`gh pr view <M> --json mergeCommit`, then `git merge-base --is-ancestor <sha> <head>`), remove any `state:` label it still has, then comment `## Shipped #M`, the head commit and its CI run link. A reverted merge reopened its issue, so only the retry is ever confirmed.

Then close as completed (`gh issue close <N> --reason completed`) each open `type:epic` issue whose sub-issues are all closed and none in 06 Ship.

**Exit gate:** the issues confirmed, each with no `state:` label, and the epics closed, or none.

## Output

In board.md's Reporting to the owner form. Summary, one line: base state at its head, the revert PR or the culprit (range or `unknown`), the issues confirmed and the epics closed. Decision: the revert PR to merge, or the red base with its failing checks and culprit, or "Nothing needed."
