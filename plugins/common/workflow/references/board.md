# Delivery Board

The optional Project board, named by lanes.json's `project`, has one Status column per phase. Without it, skip every card move. The card's column is the issue's phase; the skill that moves an issue into a column also moves its card. Lanes stay labels on the cards.

| Column | The issue is here when | Skill that works it |
| --- | --- | --- |
| 01 Define | It exists but has no `### Acceptance criteria` yet. | `spec` |
| 02 Spec | It has acceptance criteria and a scope packet and waits to be started. | `spec`, then a claim or start |
| 03 Plan | A session claimed or started it and no `## Plan` comment exists. | `plan` |
| 04 Execute | The `## Plan` comment exists and no PR is open. | `tdd`, `review`, `vcs` |
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
  --jq '.items[] | select(.content.number==<N>) | .id'                        # the card; empty when not on the board
gh project item-add <P> --owner <O> --url <issue-url> --format json --jq .id  # add it when missing
gh project item-edit --project-id <project-id> --id <item-id> \
  --field-id <status-field-id> --single-select-option-id <column-option-id>
```

Read the ids once per session and reuse them. When the Status field lacks a column above, report it to the owner, who sets the options once in the board's settings.

## Issue steps

Every skill uses these same `gh` and `git` steps. `<base>` and `<branchPrefix>` come from lanes.json (defaults `main` and `agent/afk-`); `<slug>` is the issue title in a few lowercase hyphenated words.

| Step | Commands | Card |
| --- | --- | --- |
| Claim (AFK) | `git fetch origin <base>`, `git worktree add .worktrees/afk-<N> -b <branchPrefix><N>-<slug> origin/<base>`, `gh issue edit <N> --add-label state:claimed --remove-label state:parked`, then a one-line claim comment. | 03 Plan |
| Start (attended) | `gh issue edit <N> --add-label state:started`. | 03 Plan |
| Release | `gh issue edit <N> --remove-label state:claimed,state:started` once its PR is open or the work pauses. | unchanged |
| Park | `gh issue edit <N> --remove-label lane:afk,state:claimed,state:started --add-label lane:owner,state:parked`, then one comment: the question, the options and a recommendation. Push the branch first when it holds useful work. | 02 Spec |
| Tidy | For each `.worktrees/afk-*` worktree: when `gh pr list --head <branch> --state all --json state` shows it merged or closed and `git -C <worktree> status --porcelain` is empty, `git worktree remove <worktree>` and `git branch -D <branch>`. Leave every other checkout. | |

Re-applying `lane:afk` hands a parked issue back; the next claim clears `state:parked`. `gh issue edit --remove-label` fails on a label the issue lacks, so remove only the ones it has.
