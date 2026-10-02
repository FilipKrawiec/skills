# Delivery Board

The optional Project board, named by lanes.json's `project`, has one Status column per phase. Without it, skip every card move: 06 Ship and 07 Improve then leave no trace per issue, so `ship` checks the base branch only and `improve` works from the current run or session. The card's column is the issue's phase; the skill that moves an issue into a column also moves its card. Lanes stay labels on the cards.

## Start here

Working on an issue, attended or not:

1. Find its column: its card, or the first row below that matches it.
2. In 02 Spec: claim it only when `lanes.py next` prints it; with the owner present, start it on their go-ahead (Issue steps below).
3. Invoke the column's skill and finish its exit gate, then move the card. 04 Execute ends with the Open PR step.
4. Repeat from 1 until the issue waits on someone else: parked, in 05 Review (the owner or `agent-review` merges it), or Done. After a merge, `ship` and `improve` pick it up again.

To pause or hand off, release it.

## Columns

| Column | The issue is here when | Skill that works it |
| --- | --- | --- |
| 01 Define | It exists but has no `### Acceptance criteria` yet. | `spec` |
| 02 Spec | It has acceptance criteria and a scope packet and waits to be started. | `spec`, then a claim or start |
| 03 Plan | A session claimed or started it and no `## Plan` comment exists. | `plan` |
| 04 Execute | The `## Plan` comment exists and no PR is open. | `tdd`, `review`, `vcs`, then Open PR |
| 05 Review | A PR that closes it is open. | `review`, `agent-review` |
| 06 Ship | Its PR merged and the base branch is not yet confirmed green. | `ship` |
| 07 Improve | Ship is confirmed and no `## Lessons` comment exists. | `improve` |
| Done | The `## Lessons` comment exists, or it closed as not planned. | |

## Moving a card

`<P>` is lanes.json's `project.number` and `<O>` its `project.owner`.

```bash
gh project view <P> --owner <O> --format json --jq .id                      # project id
gh project field-list <P> --owner <O> --format json \
  --jq '.fields[] | select(.name=="Status") | {id, options}'                  # field and column ids
gh project item-list <P> --owner <O> -L 1000 --format json \
  --jq '.items[] | select(.content.type=="Issue" and .content.number==<N> and .content.repository=="<owner/repo>") | .id'  # empty when not on the board
gh project item-add <P> --owner <O> --url <issue-url> --format json --jq .id  # add it when missing
gh project item-edit --project-id <project-id> --id <item-id> \
  --field-id <status-field-id> --single-select-option-id <column-option-id>
```

The token needs the `project` scope (`gh auth refresh -s project`). Read the ids once per session and reuse them. When the Status field lacks a column above, report it to the owner, who sets the options once in the board's settings.

## Issue steps

Every skill uses these same `gh` and `git` steps. `<base>` and `<branchPrefix>` come from lanes.json (defaults `main` and `agent/afk-`); `<slug>` is the issue title in a few lowercase hyphenated words. `<root>` is the main checkout, the parent of `git rev-parse --path-format=absolute --git-common-dir`; worktree paths start there whichever directory the agent is in. Remove a label only when the issue has it.

| Step | Commands | Card |
| --- | --- | --- |
| Claim (AFK) | `git fetch origin <base>`. Reuse `<root>/.worktrees/afk-<N>` when it exists; else `git worktree add <root>/.worktrees/afk-<N> <branch>` for an existing `origin/<branchPrefix><N>-*` branch; else `git worktree add <root>/.worktrees/afk-<N> -b <branchPrefix><N>-<slug> origin/<base>`. Then `gh issue edit <N> --add-label state:claimed`, removing `state:parked`, and a one-line claim comment. | 03 Plan |
| Start (attended) | `gh issue edit <N> --add-label state:started`, removing `state:parked`. | 03 Plan |
| Open PR | Push the branch, then `gh pr create` titled `<type>(<area>): <outcome>` per the project's PR template, its body starting `Closes #<N>` and linking the `## Plan` comment and the review's verdict. Then Release. | 05 Review |
| Release | Remove `state:claimed` or `state:started`. | unchanged |
| Park | Push the branch when it holds useful work. Remove `lane:afk` and `state:claimed` or `state:started`, add `lane:owner,state:parked`, then one comment: the question, the options and a recommendation. | 02 Spec, or 05 Review while its PR is open |
| Tidy | For each `<root>/.worktrees/afk-*` worktree other than the current one, whose branch starts with `<branchPrefix>`: when `gh pr list --head <branch> --state all --json state` lists no OPEN PR and at least one MERGED or CLOSED, and `git -C <worktree> status --porcelain` is empty, `git worktree remove <worktree>` and `git branch -D <branch>`. Leave every other checkout. | |

Re-applying `lane:afk` hands a parked issue back, and its next claim reuses the branch it stopped on.
