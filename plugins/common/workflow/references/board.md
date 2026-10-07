# Delivery Board

The optional board is one GitHub Project, lanes.json's `project`, holding every issue of the repository and nothing else. Its five Status columns say what a card waits for: Backlog, Todo, In progress, Review and Done. Lanes and types stay labels. Without a board, skip every card move. Read [setup.md](../skills/afk/references/setup.md) when creating or repairing the board's workflows, fields or views.

## Start here

With the owner present, an issue takes one path:

1. `spec`: an issue with its type, outcome, `### Acceptance criteria` and one lane.
2. Start (Issue steps below) once the owner asks for the issue.
3. `plan`: the owner approves the plan in the session; it is posted only when the work may outlive the session.
4. `tdd` per step, `vcs` per green slice, then `review`.
5. Open PR, which ends with the Merge gate and `lanes.py triage`/`merge`; the owner merges what triage hands them.

`ship` and `improve` run after the merge, in an AFK run or when the owner asks. A `type:task` ends with its finding recorded and the issue closed instead of a PR.

Resuming an issue, or working one unattended: find its state, the first matching row of States below, and move its card to that row's column. Unattended, claim a Ready issue only when `lanes.py next` prints it. Run the state's skill to its exit gate and repeat until the issue waits on someone else: Ready with `lane:owner`, in 05 Review, or closed. A `type:epic` issue takes its column from Epics below and is never worked here. To pause or hand off, Release it.

### Work in progress

A session holds one open PR. It claims or starts the next issue only once that PR has merged, or has passed the Merge gate and waits only on the owner while the next issue touches none of its files. With the owner present, it asks for that merge before starting the next issue. A finding outside the issue's scope becomes a new issue through `spec` (unattended: a follow-up in the run's output) instead of growing the open PR. Dependent changes merge in dependency order, each before the next one opens: a shared library or plugin change and its release go before the change that uses them.

## Reporting to the owner

Every message to the owner (a session's reply, a run's or a review pass's report, a park comment) holds exactly two parts:

1. **Summary**: the outcome, linking the PR, issue or `file:line` that carries the detail. A skill's Output section names what its Summary lines hold.
2. **Decision**: what the owner must decide or do, each with its options and a recommendation, or "Nothing needed."

A session's reply fits in five lines; a run's or a review pass's report fits in eight, one line per item that changed. Steps, commands and reasoning go in the PR, issue or log the Summary links. Output one agent hands another (a `review` verdict, a `tdd` or `vcs` envelope) keeps its own envelope.

## States

"Claimed" means the issue has `state:claimed` or `state:started`; the scope packet is the issue's ```` ```scope ```` block whose JSON parses.

| State | The issue is here when | Skill that works it | Column |
| --- | --- | --- | --- |
| 05 Review | It is open and an open PR closes it. | `agent-review`, or the owner; a session hands it over through the Merge gate | Review |
| 01 Define | It is open with no `### Acceptance criteria`. | `spec` | Backlog |
| 02 Spec | It is open with acceptance criteria and no lane, or with `lane:afk` or `lane:proposed` and no scope packet. | `spec` | Backlog |
| 03 Plan, 04 Execute | It is open and claimed. | `plan` unless a `## Plan` comment exists or the owner approved the plan in this session; then `tdd`, `vcs`, `review`, Open PR | In progress |
| Ready | It is open, unclaimed, with acceptance criteria and a lane (and a scope packet in an AFK lane): specced, parked, or its PR closed unmerged. | a claim or start | Todo |
| 06 Ship | It closed as completed, #M is the newest merged PR that closes it, and no `## Shipped #M` comment exists. | `ship` | Done |
| 07 Improve | It closed as completed and its newest `## Shipped` comment is newer than any `## Lessons` comment. | `improve` | Done |
| Closed | Any other closed issue: lessons recorded, or closed as not planned. | | Done |

`## Plan`, `## Shipped #<pr>` and `## Lessons` are issue comments whose first line is that heading; `gh issue view <N> --json state,stateReason,labels,comments,closedByPullRequestsReferences` shows them with the labels and the PRs that close the issue (an open issue lists only its open ones). GitHub links only a PR into `<base>`, so a stacked PR is missing there until it is retargeted: the issue has no open PR when that list is empty and no PR from `gh pr list --state open --search "-base:<base>" --limit 200 --json number,body` closes it with a closing keyword (`Closes #<N>`). 06 Ship and 07 Improve look only at issues closed in the last 30 days: `gh issue list --state closed --search "reason:completed closed:>=<date>" --limit 100 --json number,closedByPullRequestsReferences,comments`, so adopting the board never backfills older ones.

## Moving a card

The board's built-in workflows add each issue to Backlog, move it to Review when a PR links it, to Done when it closes and to Todo when it reopens. The skills make the remaining moves: the Card column of Issue steps below, `spec`'s move to Todo, and Start here's move of a card in the wrong column. A pull request card is removed from the board (`gh project item-delete <P> --owner <O> --id <item-id>`); its issue's card shows the PR.

`<P>` is lanes.json's `project.number` and `<O>` its `project.owner`. Read the ids once per session and reuse them; the token needs the `project` scope (`gh auth refresh -s project`).

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

When the Status field lacks one of the five columns, or the board has no Priority field, report it to the owner, who adds it once.

## Issue types

Every issue carries exactly one type label, and its title is `<type>(<area>): <outcome>` with that type's title type. The PR takes the issue's title, so its squash commit is a conventional commit.

| Label | The issue is | Title type | It ends with |
| --- | --- | --- | --- |
| `type:story` | New or changed behaviour a user can see. | `feat` | A merged PR. |
| `type:bug` | A fix for behaviour that differs from what is specified. | `fix` | A merged PR. |
| `type:chore` | A code change with no new behaviour: docs, tests, dependencies, CI, refactoring or platform. | `chore`, `docs`, `test`, `ci`, `refactor` or `perf` | A merged PR. |
| `type:task` | Work that ends in a finding or a setting rather than a code change, usually a spike. Never AFK: the owner judges the finding. | `task` | Its finding on the issue (a comment, an ADR or follow-up issues), then closed. |
| `type:epic` | The parent of the other four. | The title type of most of its slices | Every sub-issue shipped. |

## Epics

Only an epic has sub-issues: an issue that needs slices gets `type:epic`, and every piece of its remaining work is a sub-issue, because `ship` closes it once all of them have shipped. List them with `gh api repos/<owner/repo>/issues/<N>/sub_issues --paginate --jq '.[] | {number, state, state_reason}'`. An epic is never claimed and never gets its own PR; its card sits in Backlog while it has no sub-issues, In progress once it has some (`spec` moves it when it links the first), and Done when closed. Start here moves a reopened epic from Todo back to In progress.

## Priority

With a board, every open issue has a value in its single-select Priority field (P0, P1, P2), set like Status: read the field with `select(.name=="Priority")` and pass its option id to `gh project item-edit`. A slice without one takes its epic's. `lanes.py next` ranks AFK issues by it, then by age. Without a board, use `priority:P0` to `priority:P2` labels instead.

## Issue form

`spec` brings each issue it touches into this form, making the agent's fixes and reporting the owner's.

| Check | Holds when | Fix |
| --- | --- | --- |
| Type | Exactly one type label, and the title as Issue types says, stating what is true afterwards rather than an instruction. | Agent: the label from the issue's content, the title reworded from its own outcome. Owner: a type the content leaves open. |
| Lane | An open issue has exactly one lane label; a closed one has no `state:` label. | Agent, by Triage in `spec`. |
| Sections | Acceptance criteria sit under `### Acceptance criteria`, and a task's name its finding. An issue in `lane:afk` or `lane:proposed` also has `### Estimate` and a ```` ```scope ```` block, so `lanes.py` and the States checks find them. | Agent: rename a heading, content unchanged. Missing content is 02 Spec. |
| Parent | A slice is a sub-issue of its epic; an issue with sub-issues is an epic. | Owner: whether a parent becomes an epic or its sub-issues move. |
| Card | With a board: each open issue has one card in its state's column with a Priority, a closed issue's card is in Done, and no pull request has a card. | Agent: add or move a card, remove a pull request card, give a slice its epic's Priority. Owner: any other Priority. |

## Issue steps

`<base>` and `<branchPrefix>` come from lanes.json (defaults `main` and `agent/afk-`); `<slug>` is the issue title in a few lowercase hyphenated words. `<root>` is the main checkout, the parent of `git rev-parse --path-format=absolute --git-common-dir`. Remove a label only when the issue has it.

Each issue works in its own worktree; `<root>` keeps its branch, since it may hold the owner's work. When the working directory is `<root>`, enter the issue's worktree before the first edit, through the host's worktree switch when it has one.

| Step | Commands | Card |
| --- | --- | --- |
| Claim (AFK) | `git fetch origin <base>`. Reuse the worktree that `git worktree list --porcelain` shows on a `<branchPrefix><N>-` branch whose PR did not merge, wherever the host put it; else `git worktree add <root>/.worktrees/afk-<N> <branch>` for an existing `origin/<branchPrefix><N>-*` branch whose PR did not merge; else `git worktree add <root>/.worktrees/afk-<N> -b <branchPrefix><N>-<slug> origin/<base>`. When the host refuses edits outside the session's own linked worktree (its `.git` is a file) and that worktree is clean, switch it to the branch instead: `git switch <branch>` for an existing one, else `git switch -c <branchPrefix><N>-<slug> origin/<base>`. Then `gh issue edit <N> --add-label state:claimed`, removing `lane:owner`, and a one-line claim comment, ``Claimed by an AFK run on `<branch>`.``, adding only where it resumes; never a host, user name or local path. | In progress |
| Start (attended) | `git fetch origin <base>`. Reuse the worktree that `git worktree list --porcelain` shows on the issue's branch; else make one from `origin/<base>` on the project's attended branch name (`vcs`'s `<category>/<description>` by default): through the host's worktree switch, renaming the branch it makes, or with `git worktree add <root>/.worktrees/<N>-<slug> -b <branch> origin/<base>`. Then `gh issue edit <N> --add-label state:started`. | In progress |
| Open PR | Once every review finding is fixed, push the branch, then `gh pr create` titled `<type>(<area>): <outcome>` per the project's PR template, its body starting `Closes #<N>`, linking the `## Plan` comment when there is one, quoting the review's verdict and each finding with the commit that fixed it, and listing the checks the agent ran; device checks stay with the owner. A part of the issue the PR leaves to the owner (an edit to a protected path, a setting it cannot change) becomes its own `lane:owner` issue through `spec`, linked from the PR body, so each step outlives the merge; an unattended run parks the issue instead. When the PR changes what users see, its body shows before and after captures of each change, and a later commit that changes something visible adds its own before the PR is reported ready again. Open it ready for review (follow a host's default draft with `gh pr ready <pr>`). Pass the Merge gate, then run `lanes.py triage <pr>`: `review:owner` goes on only when it prints `owner`; otherwise run `lanes.py merge <pr>`, which switches on auto-merge. Report both lines. Then Release. | Review (workflow) |
| Release | Remove `state:claimed` or `state:started`. | Todo, or unchanged while its PR is open |
| Park | Push the branch when it holds useful work. Remove `lane:afk` and `state:claimed` or `state:started`, add `lane:owner`, then one comment in Reporting to the owner's form: where the work stopped, then the question with its options and a recommendation. | Todo, or unchanged while its PR is open |
| Tidy | For each worktree in `git worktree list --porcelain` other than the current one, whose branch starts with `<branchPrefix>`, wherever it lives: when `gh pr list --head <branch> --state all --json state` lists no OPEN PR and at least one MERGED or CLOSED, `git -C <worktree> status --porcelain` is empty, and `lsof -a -d cwd +D <worktree>` exits 1 without printing anything, so no process has its working directory there: `git worktree remove <worktree>` and `git branch -D <branch>`. Leave every other checkout, including one where `lsof` exits otherwise or is missing; a later run tidies it. | |

Replacing `lane:owner` with `lane:afk` hands a parked issue back, and its next claim reuses the branch it stopped on.

## Merge gate

A session runs this gate after every push to an open PR, draft or ready (the plugin's post-push hook prints the open threads beside the push), whenever the base moves while the PR waits, and before every report that names the PR, hands it to the owner, switches on auto-merge or merges it.

1. Run `lanes.py blockers <pr>`; it only reads and needs no lanes.json (outside the PR's repository, pass the PR URL). It prints every reason the PR can't merge now and exits 1 while any remains. A `mergeability not computed yet` line clears within a minute of a push; run it again then.
2. Settle each thread. Fix what the head leaves open (`vcs` phase 3), then reply on each thread naming the fixing commit. Then dispatch one isolated reviewer worker with no implementation context, given only the PR, its head and the agent-written threads: it checks each thread against the head, resolves each one it confirms fixed, and hands each one still open back to the implementing session as a finding, which fixes it and dispatches a fresh reviewer again. A person's thread and a person's change request stay for that person: name each to the owner with its first line.
3. Fix failing checks and conflicts, then run it again after every push.

The PR is ready only when the command exits 0 and prints nothing. Auto-merge may go on while only `check pending` lines remain; report that PR as waiting on its checks. Every line it still prints goes into the report to the owner as a reason the PR waits.
