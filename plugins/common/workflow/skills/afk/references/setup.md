# Setting Up Issue Lanes in a Repository

## Configuration: `.github/lanes.json`

Its presence opts the repository in; agents read it from the base branch themselves. Only `repo` is required. Agents ignore keys no longer read (`protected`, `chores`, `dependencyFiles`, `guard`): owner paths belong in CODEOWNERS.

| Key | Meaning |
| --- | --- |
| `repo` | `owner/name`. |
| `owner` | The owner's login; default the repository owner. |
| `implementer`, `reviewer` | [Machine users](github-safety.md); default `owner`. |
| `base` | Default `main`. |
| `project` | `{"owner": "<login>", "number": <n>}`: the board. |
| `alwaysInScope` | Path prefixes every AFK change may touch. |
| `branchPrefix`, `staleClaimHours` | Defaults `agent/afk-`, `3`. |
| `agentReview`, `reviewRounds` | `true` when `agent-review` reviews open PRs; rounds cap per PR. Defaults `false`, `3`. |
| `ownerPaths`, `ownerLabels`, `ownerLines` | `agent-review`'s owner rules: paths beyond CODEOWNERS, ship-on-merge labels, line limit (800). |

```json
{
  "repo": "acme/app",
  "project": {"owner": "acme", "number": 3},
  "alwaysInScope": ["docs/"],
  "agentReview": true
}
```

## One-time setup

- Create each missing label below with `gh label create <name> --color <hex> --description "<text>"`.
- GitHub: apply [github-safety.md](github-safety.md); `scripts/github-safety.sh check` exits 0 before unattended runs.
- Add one line to the project's agent rules: delivery follows the workflow plugin's skills, linking the project's workflow page of project values only.

## Board

- Status columns Backlog, Todo, In progress, Review, Done; single-select Priority (P0, P1, P2). Existing board: add options, move every card, delete old options.
- `gh auth refresh -s project`.
- Workflows: Auto-add (`is:issue`); Item added → Backlog; PR linked → Review; closed → Done; reopened → Todo.
- Views, first is default:

| View | Layout | Filter | Fields |
| --- | --- | --- | --- |
| Epics | Table | `label:"type:epic" -status:Done` | Title, Status, Priority, Sub-issues progress, Parent issue |
| Board | Board by Status | `-label:"type:epic"` | Title, Labels, Priority, Parent issue, Linked pull requests |

## Labels

| Label | Meaning |
| --- | --- |
| `lane:afk` | Owner-approved for AFK. |
| `lane:proposed` | Agent recommends AFK; owner decides. |
| `lane:owner` | Needs the owner. |
| `state:claimed`, `state:started` | An AFK run, or another session, is on it. |
| `review:owner` | PR for the owner; `agent-review` withholds approval. |
| `type:story`, `type:bug`, `type:chore`, `type:task`, `type:epic` | One per issue. |

## Unattended runs

Schedule runs in the main checkout so they never overlap. Prompt:

```text
Preflight, stop and report on any failure:
1. The working directory is inside <owner>/<repo>.
2. `gh api user --jq .login` prints lanes.json's `implementer`, and
   `git remote get-url --push origin` starts `https://`; else pushes and PRs
   run as someone else, so stop.
3. With a board in lanes.json, `gh project view <number> --owner <owner>`
   succeeds; otherwise the token lacks the `project` scope, so stop.
Then invoke the `afk` skill by name. The owner is away: park instead of asking. Never
switch, pull, reset or stash this checkout: it may hold the owner's work.
```

- With `agentReview`, schedule a prompt opening with `/<plugin>:agent-review` (only a leading slash command starts it) naming the repository, how to wake the runner and any legacy review marker. One task may run both: that line, then the AFK prompt above, waking no runner. Keep its prompt and installer in the repository.
- An orchestrating session may instead start one session per run with the AFK prompt naming the issue; runs in one checkout never overlap, so it starts the next only after the last one ends.
- Approve its tool prompts on the first run.
