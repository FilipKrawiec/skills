# Delivery Board

The optional Project board, named by lanes.json's `project`, has five Status columns that say what a card waits for: Backlog, Todo, In progress, Review and Done. Several phases share a column, and 06 Ship and 07 Improve run after the merge, so they leave issue comments instead. Without a board, skip every card move. Lanes stay labels on the cards.

## Start here

Working on an issue, attended or not:

1. Find its state: the first row of States below that matches it. With a board, move its card to that row's column when it sits elsewhere.
2. In Ready: claim it only when `lanes.py next` prints it; with the owner present, start it on their go-ahead (Issue steps below).
3. Invoke the state's skill and finish its exit gate. 04 Execute ends with the Open PR step.
4. Repeat from 1 until the issue waits on someone else: Ready with `lane:owner`, in 05 Review (the owner or `agent-review` merges it), or closed. After a merge, `ship` and `improve` pick it up again.

To pause or hand off, release it.

## States

The seven phases plus Ready and Closed. "Claimed" means the issue has `state:claimed` or `state:started`; the scope packet is the issue's ```` ```scope ```` block whose JSON parses.

| State | The issue is here when | Skill that works it | Column |
| --- | --- | --- | --- |
| 05 Review | It is open and an open PR closes it. | `agent-review`, or the owner | Review |
| 01 Define | It is open with no `### Acceptance criteria`. | `spec` | Backlog |
| 02 Spec | It is open with acceptance criteria and no scope packet. | `spec` | Backlog |
| 03 Plan | It is open, claimed, and has no `## Plan` comment. | `plan` | In progress |
| 04 Execute | It is open, claimed, and has a `## Plan` comment. | `tdd`, `vcs`, `review`, then Open PR | In progress |
| Ready | It is open, unclaimed, with acceptance criteria and a scope packet: specced, parked, or its PR closed unmerged. | a claim or start | Todo |
| 06 Ship | A merged PR #M closed it as completed and no `## Shipped #M` comment exists. | `ship` | Done |
| 07 Improve | Its newest `## Shipped` comment is newer than any `## Lessons` comment. | `improve` | Done |
| Closed | Any other closed issue: lessons recorded, or closed as not planned. | | Done |

`## Plan`, `## Shipped #<pr>` and `## Lessons` are issue comments whose first line is that heading; `gh issue view <N> --json state,stateReason,labels,comments` shows them with the labels. To find issues in 06 Ship and 07 Improve, read merges newest first with `gh pr list --state merged --base <base> --limit 100 --json number,mergeCommit,closingIssuesReferences` and stop at the first merge whose closed issues all carry its `## Shipped` comment; report it when all 100 lack one.

## Moving a card

GitHub's built-in project workflows make most moves. Turn these on once in the board's Workflows settings:

| Workflow | Setting |
| --- | --- |
| Auto-add to project | This repository, filter `is:issue`. |
| Item added to project | Issues only; Status Backlog. |
| Pull request linked to issue | Status Review (a draft PR counts too). |
| Item closed | Status Done. |
| Item reopened | Status Todo. |

The skills move a card only where no workflow does: into Todo when `spec` finishes or a run parks or releases an issue, into In progress on Claim or Start, and wherever Start here's step 1 finds it in the wrong column (a reopened issue without a spec, a PR closed unmerged, a workflow that is off).

`<P>` is lanes.json's `project.number` and `<O>` its `project.owner`.

```bash
gh project view <P> --owner <O> --format json --jq .id                      # project id
gh project field-list <P> --owner <O> --format json \
  --jq '.fields[] | select(.name=="Status") | {id, options}'                  # field and column ids
gh project item-list <P> --owner <O> -L 1000 --format json \
  --jq '.items[] | select(.content.type=="Issue" and .content.number==<N> and .content.repository=="<owner/repo>") | .id'  # empty when not on the board
gh project item-add <P> --owner <O> --url <issue-url> --format json --jq .id  # add it when missing, then re-read its Status until the board sets Backlog
gh project item-edit --project-id <project-id> --id <item-id> \
  --field-id <status-field-id> --single-select-option-id <column-option-id>
```

The token needs the `project` scope (`gh auth refresh -s project`). Read the ids once per session and reuse them. When the Status field lacks one of the five columns, report it to the owner, who sets the options once in the board's settings.

## Issue steps

Every skill uses these same `gh` and `git` steps. `<base>` and `<branchPrefix>` come from lanes.json (defaults `main` and `agent/afk-`); `<slug>` is the issue title in a few lowercase hyphenated words. `<root>` is the main checkout, the parent of `git rev-parse --path-format=absolute --git-common-dir`; worktree paths start there whichever directory the agent is in. Remove a label only when the issue has it.

| Step | Commands | Card |
| --- | --- | --- |
| Claim (AFK) | `git fetch origin <base>`. Reuse `<root>/.worktrees/afk-<N>` when it exists; else `git worktree add <root>/.worktrees/afk-<N> <branch>` for an existing `origin/<branchPrefix><N>-*` branch; else `git worktree add <root>/.worktrees/afk-<N> -b <branchPrefix><N>-<slug> origin/<base>`. Then `gh issue edit <N> --add-label state:claimed`, removing `state:parked` and `lane:owner`, and a one-line claim comment. | In progress |
| Start (attended) | `gh issue edit <N> --add-label state:started`, removing `state:parked`. | In progress |
| Open PR | Push the branch, then `gh pr create` titled `<type>(<area>): <outcome>` per the project's PR template, its body starting `Closes #<N>`, linking the `## Plan` comment and quoting the review's verdict and open findings. Then Release. | Review (workflow) |
| Release | Remove `state:claimed` or `state:started`. | Todo, or unchanged while its PR is open |
| Park | Push the branch when it holds useful work. Remove `lane:afk` and `state:claimed` or `state:started`, add `lane:owner,state:parked`, then one comment: the question, the options and a recommendation. | Todo, or unchanged while its PR is open |
| Tidy | For each `<root>/.worktrees/afk-*` worktree other than the current one, whose branch starts with `<branchPrefix>`: when `gh pr list --head <branch> --state all --json state` lists no OPEN PR and at least one MERGED or CLOSED, and `git -C <worktree> status --porcelain` is empty, `git worktree remove <worktree>` and `git branch -D <branch>`. Leave every other checkout. | |

Re-applying `lane:afk` hands a parked issue back, and its next claim reuses the branch it stopped on.
