# Delivery Board

The optional Project board, named by lanes.json's `project`, has five Status columns that say what a card waits for: Backlog, Todo, In progress, Review and Done. Phases say what the work is doing; several phases share a column, and 06 Ship and 07 Improve happen after the merge, so they leave issue comments instead of columns. Without a board, skip every card move. Lanes stay labels on the cards.

## Start here

Working on an issue, attended or not:

1. Find its phase: the first row of Phases below that matches it.
2. Before 03 Plan: claim it only when `lanes.py next` prints it; with the owner present, start it on their go-ahead (Issue steps below).
3. Invoke the phase's skill and finish its exit gate. 04 Execute ends with the Open PR step.
4. Repeat from 1 until the issue waits on someone else: parked, in 05 Review (the owner or `agent-review` merges it), or merged. After a merge, `ship` and `improve` pick it up again.

To pause or hand off, release it.

## Phases

| Phase | The issue is here when | Skill that works it | Column |
| --- | --- | --- | --- |
| 01 Define | It exists but has no `### Acceptance criteria` yet. | `spec` | Backlog |
| 02 Spec | It has acceptance criteria and `spec` hasn't finished it: no scope packet or lane decision yet. | `spec` | Backlog |
| Ready | `spec` finished it, or a run parked it, and it waits to be started. | a claim or start | Todo |
| 03 Plan | A session claimed or started it and no `## Plan` comment exists. | `plan` | In progress |
| 04 Execute | The `## Plan` comment exists and no PR is open. | `tdd`, `vcs`, `review`, then Open PR | In progress |
| 05 Review | A PR that closes it is open. | `agent-review`, or the owner | Review |
| 06 Ship | Its PR merged and no `## Shipped` comment exists. | `ship` | Done |
| 07 Improve | A `## Shipped` comment exists and no `## Lessons` comment. | `improve` | Done |
| Closed | The `## Lessons` comment exists, or it closed as not planned. | | Done |

`## Shipped` and `## Lessons` are issue comments whose first line is that heading. Find the issues waiting on them through recent merges: `gh pr list --state merged --base <base> --limit 20 --json number,mergeCommit,closingIssuesReferences` lists them, and `gh issue view <N> --json comments --jq '.comments[].body'` shows which headings each issue has.

## Moving a card

GitHub's built-in project workflows make most moves. Turn these on once in the board's Workflows settings:

| Workflow | Sets Status to |
| --- | --- |
| Auto-add to project (this repository's issues) | |
| Item added to project | Backlog |
| Pull request linked to issue | Review |
| Item closed | Done |
| Item reopened | Todo |

The skills move a card themselves only where no workflow does: Backlog to Todo (`spec`), Todo to In progress (Claim or Start), back to Todo (Park, or a PR closed unmerged), and back to Backlog when `plan` returns an issue to `spec`. When a workflow-driven move didn't happen, for example because the workflow is off, make it with the same commands.

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

The token needs the `project` scope (`gh auth refresh -s project`). Read the ids once per session and reuse them. When the Status field lacks one of the five columns, report it to the owner, who sets the options once in the board's settings.

## Issue steps

Every skill uses these same `gh` and `git` steps. `<base>` and `<branchPrefix>` come from lanes.json (defaults `main` and `agent/afk-`); `<slug>` is the issue title in a few lowercase hyphenated words. `<root>` is the main checkout, the parent of `git rev-parse --path-format=absolute --git-common-dir`; worktree paths start there whichever directory the agent is in. Remove a label only when the issue has it.

| Step | Commands | Card |
| --- | --- | --- |
| Claim (AFK) | `git fetch origin <base>`. Reuse `<root>/.worktrees/afk-<N>` when it exists; else `git worktree add <root>/.worktrees/afk-<N> <branch>` for an existing `origin/<branchPrefix><N>-*` branch; else `git worktree add <root>/.worktrees/afk-<N> -b <branchPrefix><N>-<slug> origin/<base>`. Then `gh issue edit <N> --add-label state:claimed`, removing `state:parked` and `lane:owner`, and a one-line claim comment. | In progress |
| Start (attended) | `gh issue edit <N> --add-label state:started`, removing `state:parked`. | In progress |
| Open PR | Push the branch, then `gh pr create` titled `<type>(<area>): <outcome>` per the project's PR template, its body starting `Closes #<N>`, linking the `## Plan` comment and quoting the review's verdict and open findings. Then Release. | Review (workflow) |
| Release | Remove `state:claimed` or `state:started`. | unchanged |
| Park | Push the branch when it holds useful work. Remove `lane:afk` and `state:claimed` or `state:started`, add `lane:owner,state:parked`, then one comment: the question, the options and a recommendation. | Todo, or unchanged while its PR is open |
| Tidy | For each `<root>/.worktrees/afk-*` worktree other than the current one, whose branch starts with `<branchPrefix>`: when `gh pr list --head <branch> --state all --json state` lists no OPEN PR and at least one MERGED or CLOSED, and `git -C <worktree> status --porcelain` is empty, `git worktree remove <worktree>` and `git branch -D <branch>`. Leave every other checkout. | |

Re-applying `lane:afk` hands a parked issue back, and its next claim reuses the branch it stopped on.
