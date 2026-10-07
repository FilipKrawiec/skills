# Delivery Board

The optional board is lanes.json's `project`, columns Backlog, Todo, In progress, Review, Done. Without one, skip card moves; use `priority:P*` labels. Setup: [setup.md](../skills/afk/references/setup.md).

## Start here

Attended: `spec` → Start when the owner asks → `plan`, approved in session → `tdd`, `vcs`, `review` → Open PR.

Resuming or unattended: run the first matching States row's skill, moving the card, until the issue waits on someone. Unattended, claim only what `lanes.py next` prints. Never work an epic.

### Work in progress

- Hold one open PR; start another issue only once it merged, or passed the Merge gate and waits only on the owner, sharing no files.
- Out-of-scope findings become new issues via `spec`.
- Merge dependent changes in dependency order.

## Reporting to the owner

Every message to the owner (reply, report, park comment) has exactly two parts:

1. **Summary**: the outcome, linking the PR, issue or `file:line` with the detail.
2. **Decision**: what the owner must decide or do, with options and a recommendation, or "Nothing needed."

A session reply ≤ 5 lines; a run or review report ≤ 8. Steps and reasoning go where the Summary links.

## States

Claimed: `state:claimed` or `state:started`. Scope packet: a parseable ```` ```scope ```` block.

- **05 Review** (Review): open PR closes it. Merge gate.
- **01 Define** (Backlog): no `### Acceptance criteria`. `spec`.
- **02 Spec** (Backlog): no lane, or AFK lane without scope packet. `spec`.
- **03 Plan, 04 Execute** (In progress): claimed. `plan` unless a `## Plan` comment exists or the owner approved one; then `tdd`, `vcs`, `review`, Open PR.
- **Ready** (Todo): unclaimed, criteria, lane, scope packet if AFK.
- **06 Ship** (Done): closed completed; newest merged closing PR #M lacks a `## Shipped #M` comment. `ship`.
- **07 Improve** (Done): closed completed; newest `## Shipped` newer than any `## Lessons`. `improve`.
- **Closed** (Done): otherwise.

A stacked PR doesn't link: search open PRs for `Closes #<N>`. 06 and 07 look back 30 days.

## Moving a card

Board workflows set Backlog, Review, Done and reopened Todo; skills make other moves (`gh project item-edit`, scope `project`). Delete PR cards. Report a missing column or field.

## Issue types

One label; title `<type>(<area>): <end state>`: `type:story` `feat`, `type:bug` `fix`, `type:chore` `chore`/`docs`/`test`/`ci`/`refactor`/`perf`, `type:task` `task` (a finding, never AFK), `type:epic`.

## Epics

Only epics have sub-issues, holding all remaining work. Never claim or PR one. Card: In progress once it has sub-issues.

## Priority

Every open board issue has Priority P0–P2, a slice its epic's. `lanes.py next` ranks by it.

## Issue form

`spec` brings each issue it touches to: Issue types; one lane when open, no `state:` label when closed; `### Acceptance criteria`, plus `### Estimate` and a scope packet in `lane:afk`/`lane:proposed`; slices under their epic; a card with Priority.

## Issue steps

`<base>`, `<branchPrefix>`: lanes.json (default `main`, `agent/afk-`). Never edit in the main checkout `<root>`; enter the issue's worktree.

- **Claim (AFK)** → In progress: `git fetch origin <base>`; reuse the worktree or unmerged `<branchPrefix><N>-*` branch, else `git worktree add <root>/.worktrees/afk-<N> -b <branchPrefix><N>-<slug> origin/<base>` (host-confined: `git switch` its clean worktree). Add `state:claimed`, remove `lane:owner`, comment ``Claimed by an AFK run on `<branch>`.``
- **Start (attended)** → In progress: same, on a `vcs` branch name; add `state:started`.
- **Open PR** → Review: push; `gh pr create`: issue's title; body `Closes #<N>`, plan link, review verdict with fixing commits, checks run, before/after captures of visible changes. Owner-only leftovers become linked `lane:owner` issues. Open ready. Merge gate; `lanes.py triage <pr>`: `owner` → add `review:owner`, else `lanes.py merge <pr>`. Report both; Release.
- **Release**: remove `state:claimed`/`state:started`; card to Todo unless a PR is open.
- **Park**: push useful work; replace `lane:afk` and `state:*` with `lane:owner`; comment per Reporting to the owner.
- **Tidy**: remove other `<branchPrefix>` worktrees and branches whose PR merged or closed, if clean and `lsof -a -d cwd +D <wt>` exits 1.

## Merge gate

Run after every push to an open PR, when the base moves, and before reporting or merging it.

1. `lanes.py blockers <pr>` lists merge blockers, exiting 1 while any remain.
2. Fix each open thread (`vcs` phase 3), replying with the fixing commit. Then dispatch an isolated reviewer worker with no implementation context: it resolves threads it confirms fixed and hands open ones back; fix, dispatch afresh. A person's threads stay theirs: name each to the owner.
3. Fix failing checks and conflicts.

Ready only on exit 0, no output; auto-merge may go on with only `check pending` left. Report remaining lines as why the PR waits.
