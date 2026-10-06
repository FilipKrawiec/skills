# Delivery Board

The optional board is one GitHub Project, lanes.json's `project`, holding every issue of the repository and nothing else. Its five Status columns say what a card waits for: Backlog, Todo, In progress, Review and Done. Several phases share a column, and 06 Ship and 07 Improve run after the merge, so they leave issue comments instead. Epics share the board and use three of the columns; two views keep them apart from the rest (Views below). Lanes and types stay labels. Without a board, skip every card move.

## Start here

Working on an issue, attended or not:

1. Find its state: the first row of States below that matches it. With a board, move its card to that row's column when it sits elsewhere. A `type:epic` issue is never worked here: its column comes from Epics below.
2. In Ready: claim it only when `lanes.py next` prints it; with the owner present, start it on their go-ahead (Issue steps below).
3. Invoke the state's skill and finish its exit gate. 04 Execute ends with the Open PR step; for a `type:task` it ends with the finding recorded and the issue closed (Issue types below).
4. Repeat from 1 until the issue waits on someone else: Ready with `lane:owner`, in 05 Review (the owner or `agent-review` merges it), or closed. After a merge, `ship` and `improve` pick it up again.

To pause or hand off, release it.

### Work in progress

A session holds one open PR. It claims or starts the next issue only once that PR has merged, or has passed the Merge gate and waits only on the owner while the next issue touches none of its files. While its PR waits, the session keeps it mergeable: whenever the base moves or a review posts a thread, it runs the Merge gate again and fixes what that prints before going on with the next issue. With the owner present, it asks for that merge before starting the next issue, rather than gathering PRs for one review. A finding outside the issue's scope becomes a new issue through `spec` and does not grow the open PR. Dependent changes merge in dependency order, each before the next one opens: a shared library or plugin change and its release go before the change that uses them. Every PR then starts from the merged base, and none conflicts with an earlier one.

## States

The seven phases plus Ready and Closed. "Claimed" means the issue has `state:claimed` or `state:started`; the scope packet is the issue's ```` ```scope ```` block whose JSON parses.

| State | The issue is here when | Skill that works it | Column |
| --- | --- | --- | --- |
| 05 Review | It is open and an open PR closes it. | `agent-review`, or the owner; a session hands it over through the Merge gate | Review |
| 01 Define | It is open with no `### Acceptance criteria`. | `spec` | Backlog |
| 02 Spec | It is open with acceptance criteria and no scope packet or no lane. | `spec` | Backlog |
| 03 Plan | It is open, claimed, and has no `## Plan` comment. | `plan` | In progress |
| 04 Execute | It is open, claimed, and has a `## Plan` comment. | `tdd`, `vcs`, `review`, then Open PR | In progress |
| Ready | It is open, unclaimed, with acceptance criteria, a scope packet and a lane: specced, parked, or its PR closed unmerged. Without a lane it is still in 02 Spec. | a claim or start | Todo |
| 06 Ship | It closed as completed, #M is the newest merged PR that closes it, and no `## Shipped #M` comment exists. | `ship` | Done |
| 07 Improve | It closed as completed and its newest `## Shipped` comment is newer than any `## Lessons` comment. | `improve` | Done |
| Closed | Any other closed issue: lessons recorded, or closed as not planned. | | Done |

`## Plan`, `## Shipped #<pr>` and `## Lessons` are issue comments whose first line is that heading; `gh issue view <N> --json state,stateReason,labels,comments,closedByPullRequestsReferences` shows them with the labels and the PRs that close the issue; an open issue lists only its open ones. GitHub links only a PR into the default branch, so a stacked PR, based on another PR's branch, is missing there until it is retargeted: the issue has no open PR when that list is empty and no PR from `gh pr list --state open --search "-base:<base>" --json number,body` closes it with a closing keyword (`Closes #<N>`). Issues in 06 Ship and 07 Improve are among those closed in the last 30 days: `gh issue list --state closed --search "reason:completed closed:>=<date>" --limit 100 --json number,closedByPullRequestsReferences,comments`. Older issues have left the cycle, so adopting the board never backfills them.

## Moving a card

GitHub's built-in project workflows make most moves. Turn these on once in the board's Workflows settings:

| Workflow | Setting |
| --- | --- |
| Auto-add to project | This repository, filter `is:issue`. |
| Item added to project | Issues only; Status Backlog. |
| Pull request linked to issue | Status Review (a draft PR counts too). |
| Item closed | Status Done. |
| Item reopened | Status Todo. |

The skills make the remaining moves: the Card column of Issue steps below, `spec`'s move to Todo, and Start here's step 1 wherever a card sits in the wrong column (a reopened issue without a spec, a PR closed unmerged, a workflow that is off). A pull request card is removed from the board (`gh project item-delete <P> --owner <O> --id <item-id>`); the PR itself stays, and its issue's card shows it.

`<P>` is lanes.json's `project.number` and `<O>` its `project.owner`.

```bash
gh project view <P> --owner <O> --format json --jq .id                      # project id
gh project field-list <P> --owner <O> --format json \
  --jq '.fields[] | select(.name=="Status") | {id, options}'                  # field and column ids
gh project item-list <P> --owner <O> -L 1000 --format json \
  --jq '.items[] | select(.content.type=="Issue" and .content.number==<N> and .content.repository=="<owner/repo>") | .id'  # empty when not on the board
gh project item-add <P> --owner <O> --url <issue-url> --format json --jq .id  # add it when missing; re-read its Status up to 3 times for the board's Backlog, then set the column (report a workflow that never set it)
gh project item-edit --project-id <project-id> --id <item-id> \
  --field-id <status-field-id> --single-select-option-id <column-option-id>
```

The token needs the `project` scope (`gh auth refresh -s project`). Read the ids once per session and reuse them. When the Status field lacks one of the five columns, report it to the owner, who sets the options once in the board's settings.

## Views

A Project's Status options and workflows serve all its items, so epics stay on this board and views, not a second Project, keep them apart. The owner creates the views once, in this order, so the first is the default:

| View | Layout | Filter | Fields shown |
| --- | --- | --- | --- |
| Epics | Table | `label:"type:epic" -status:Done` | Title, Status, Priority, Sub-issues progress, Parent issue |
| Board | Board by Status | `-label:"type:epic"` | Title, Labels, Priority, Parent issue, Linked pull requests |

Clearing `-status:Done` in the filter bar shows finished epics without saving the view.

## Issue types

Every issue carries exactly one type label, and its title starts with that type's title type: `<type>(<area>): <outcome>`. The PR takes the issue's title, so its squash commit is a conventional commit.

| Label | The issue is | Title type | It ends with |
| --- | --- | --- | --- |
| `type:story` | New or changed behaviour a user can see. | `feat` | A merged PR. |
| `type:bug` | A fix for behaviour that differs from what is specified. | `fix` | A merged PR. |
| `type:chore` | A code change with no new behaviour: docs, tests, dependencies, CI, refactoring or platform. | `chore`, `docs`, `test`, `ci`, `refactor` or `perf` | A merged PR. |
| `type:task` | Work that ends in a finding or a setting rather than a code change, usually a spike. Never AFK: the owner judges the finding. | `task` | Its finding on the issue (a comment, an ADR or follow-up issues), then closed. |
| `type:epic` | The parent of the other four. | The title type of most of its slices | Every sub-issue shipped. |

## Epics

Only an epic has sub-issues: an issue that needs slices gets `type:epic`, and every piece of its remaining work is a sub-issue, because `ship` closes it once all of them have shipped. List them with `gh api repos/<owner/repo>/issues/<N>/sub_issues --paginate --jq '.[] | {number, state, state_reason}'`. An epic is never claimed and never gets its own PR, so its card uses three of the columns:

| The epic is here when | Column |
| --- | --- |
| It is open with no sub-issues. | Backlog |
| It is open with sub-issues. | In progress |
| It is closed. | Done |

`spec` moves the epic to In progress when it links the first sub-issue. Item closed moves it to Done; Item reopened sets Todo, so Start here's step 1 moves a reopened epic back to In progress.

## Priority

With a board, every open issue has a value in its single-select Priority field (P0, P1, P2), set like Status: read the field with `select(.name=="Priority")` and pass its option id to `gh project item-edit`. A slice without one takes its epic's. `lanes.py next` ranks AFK issues by it, then by age. Without a board, use `priority:P0` to `priority:P2` labels instead. When the board has no Priority field, report it to the owner, who adds it once.

## Issue form

`spec` brings each issue it touches into this form, making the agent's fixes and reporting the owner's.

| Check | Holds when | Fix |
| --- | --- | --- |
| Type | Exactly one type label, and the title as Issue types says, stating what is true afterwards rather than an instruction. | Agent: the label from the issue's content, the title reworded from its own outcome. Owner: a type the content leaves open. |
| Lane | An open issue has exactly one lane label; a closed one has no `state:` label. | Agent, by Triage in `spec`. |
| Sections | Acceptance criteria, estimate and scope packet, once written, sit under the headings the project's issue form writes (`### Acceptance criteria`, `### Estimate`, a ```` ```scope ```` block), so the States checks find them; a task's acceptance criteria name its finding. | Agent: rename a heading, content unchanged. Missing content is 02 Spec. |
| Parent | A slice is a sub-issue of its epic; an issue with sub-issues is an epic. | Owner: whether a parent becomes an epic or its sub-issues move. |
| Card | With a board: each open issue has one card in its state's column with a Priority, a closed issue's card is in Done, and no pull request has a card. | Agent: add or move a card, remove a pull request card, give a slice its epic's Priority. Owner: any other Priority. |

## Issue steps

Every skill uses these same `gh` and `git` steps. `<base>` and `<branchPrefix>` come from lanes.json (defaults `main` and `agent/afk-`); `<slug>` is the issue title in a few lowercase hyphenated words. `<root>` is the main checkout, the parent of `git rev-parse --path-format=absolute --git-common-dir`; worktree paths start there whichever directory the agent is in. Remove a label only when the issue has it.

Each issue works in its own worktree; `<root>` keeps its branch, since it may hold the owner's work. When the working directory is `<root>`, enter the issue's worktree before the first edit, through the host's worktree switch when it has one; the lanes guard catches edits and branch switches in `<root>`.

| Step | Commands | Card |
| --- | --- | --- |
| Claim (AFK) | `git fetch origin <base>`. Reuse the worktree that `git worktree list --porcelain` shows on a `<branchPrefix><N>-` branch whose PR did not merge, wherever the host put it; else `git worktree add <root>/.worktrees/afk-<N> <branch>` for an existing `origin/<branchPrefix><N>-*` branch whose PR did not merge; else `git worktree add <root>/.worktrees/afk-<N> -b <branchPrefix><N>-<slug> origin/<base>`. When the host refuses edits outside the session's own linked worktree (its `.git` is a file) and that worktree is clean, switch it to the branch instead of adding a worktree: `git switch <branch>` for an existing one, else `git switch -c <branchPrefix><N>-<slug> origin/<base>`. Then `gh issue edit <N> --add-label state:claimed`, removing `state:parked` and `lane:owner`, and a one-line claim comment, ``Claimed by an AFK run on `<branch>`.``, adding only where it resumes; never a host, user name or local path. | In progress |
| Start (attended) | `git fetch origin <base>`. Reuse the worktree that `git worktree list --porcelain` shows on the issue's branch; else make one from `origin/<base>` on the project's attended branch name (`vcs`'s `<category>/<description>` by default): through the host's worktree switch, renaming the branch it makes, or with `git worktree add <root>/.worktrees/<N>-<slug> -b <branch> origin/<base>`. Then `gh issue edit <N> --add-label state:started`, removing `state:parked`. | In progress |
| Open PR | Once every review finding is fixed, push the branch, then `gh pr create` titled `<type>(<area>): <outcome>` per the project's PR template, its body starting `Closes #<N>`, linking the `## Plan` comment and quoting the review's verdict and each finding with the commit that fixed it; it lists the checks the agent ran and leaves device checks to the owner. When the PR changes what users see, its body shows before and after captures of each change, and a later commit that changes something visible adds its own to the PR body before the PR is reported ready again. Open it ready for review, so its checks run and it can merge; when the host opens drafts by default, follow with `gh pr ready <pr>`. Run `lanes.py triage <pr>` and report its line: `review:owner` goes on only when it prints `owner`; otherwise run `lanes.py merge <pr>`, which switches on auto-merge so the PR lands when its checks pass, and report its line too. Pass the Merge gate below before `lanes.py merge` and again before reporting the PR. Then Release. | Review (workflow) |
| Release | Remove `state:claimed` or `state:started`. | Todo, or unchanged while its PR is open |
| Park | Push the branch when it holds useful work. Remove `lane:afk` and `state:claimed` or `state:started`, add `lane:owner,state:parked`, then one comment: the question, the options and a recommendation. | Todo, or unchanged while its PR is open |
| Tidy | For each worktree in `git worktree list --porcelain` other than the current one, whose branch starts with `<branchPrefix>`, wherever it lives: when `gh pr list --head <branch> --state all --json state` lists no OPEN PR and at least one MERGED or CLOSED, `git -C <worktree> status --porcelain` is empty, and `lsof -a -d cwd +D <worktree>` exits 1 without printing anything, so no process has its working directory there: `git worktree remove <worktree>` and `git branch -D <branch>`. Leave every other checkout, including one where `lsof` exits otherwise or is missing; a later run tidies it. | |

Re-applying `lane:afk` hands a parked issue back, and its next claim reuses the branch it stopped on.

## Merge gate

A base branch that requires resolved conversations, passing checks or an up-to-date branch reports a PR that misses any of them only as `BLOCKED`, and a review agent can post a thread after a session last looked. So a session runs this gate at hand-off time: each time it reports a PR ready, hands it to the owner to merge, switches on auto-merge from the Open PR step or merges it itself.

1. Run `lanes.py blockers <pr>`. It prints every reason the PR can't merge now: failing and pending checks, a conflict with or lag behind the base, each unresolved review thread with its `path:line`, first line and writer (`agent-written`, or `@<login>`), standing change requests and a review the base branch still requires; it exits 1 while any remains. It only reads, needs no lanes.json, and outside the PR's repository takes the PR URL. A `mergeability not computed yet` line clears within a minute of a push; run it again then.
2. Settle each thread. When the head fixes it, reply naming the fixing commit, and resolve it when it is agent-written. When the head doesn't fix it, fix it (`vcs` Phase 3), then reply and resolve the same way. A person's thread and a person's change request stay for that person: name each to the owner with its first line.
3. Fix failing checks and conflicts, then run it again after every push.

The PR is ready only when the command exits 0 and prints nothing. Auto-merge may go on while only `check pending` lines remain, since it waits for them; report that PR as waiting on its checks. Every line it still prints goes into the report to the owner as a reason the PR waits.
