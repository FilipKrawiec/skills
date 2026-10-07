# Setting Up Issue Lanes in a Repository

## Configuration: `.github/lanes.json`

Its presence opts the repository in. Lists extend `scripts/lanes.py`'s defaults; scalars replace them. Only `repo` is required.

| Key | Meaning |
| --- | --- |
| `repo` | `owner/name`. |
| `owner` | Login whose PRs may auto-merge; default the repository owner. |
| `base` | Default `main`. |
| `project` | `{"owner": "<login>", "number": <n>}`: the board. |
| `protected` | Path regexes AFK work may not change (adds to dot-directories, `AGENTS.md`, justfile, Makefile); add the host's instruction file. |
| `alwaysInScope` | Path prefixes every AFK change may touch. |
| `chores` | Path regexes that auto-merge on green (adds to `^docs/`, `\.md$`, tests). |
| `dependencyFiles` | Manifests and lockfiles Dependabot may auto-merge, except across a major (or sub-1.0 minor) version. |
| `branchPrefix`, `staleClaimHours` | Defaults `agent/afk-`, `3`. |
| `agentReview`, `reviewRounds` | `true` when `agent-review` reviews open PRs; rounds cap per PR. Defaults `false`, `3`. |
| `ownerPaths`, `ownerLabels`, `ownerLines` | Owner rules: paths, ship-on-merge labels, line limit (800). |
| `guard` | `[{"pattern": "<regex>", "reason": "<why>"}]`: extra commands the guard catches. |

```json
{
  "repo": "acme/app",
  "project": {"owner": "acme", "number": 3},
  "protected": ["^infra/"],
  "alwaysInScope": ["docs/"],
  "guard": [{"pattern": "\\bnpm\\s+run\\s+deploy\\b", "reason": "Deploys run from CI."}]
}
```

## One-time setup

- Create each missing label below with `gh label create <name> --color <hex> --description "<text>"`.
- GitHub: apply [github-safety.md](github-safety.md); `scripts/github-safety.sh check` must exit 0 before the first unattended run.
- Add one line to the project's agent rules: delivery follows the workflow plugin's skills, linking the project's workflow page of project values only.

## Board

- Status: the five columns in [board.md](../../../references/board.md); single-select Priority (P0, P1, P2). On an existing board, add options, move every card, then delete old options.
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
| `review:owner` | PR for the owner; `lanes.py merge` leaves it. |
| `type:story`, `type:bug`, `type:chore`, `type:task`, `type:epic` | One per issue (board.md's Issue types). |

## Unattended runs

Schedule runs in the main checkout so they never overlap. Prompt:

```text
Preflight, stop and report on any failure:
1. The working directory is inside <owner>/<repo>.
2. `gh pr merge --help` is refused by the lanes guard; if it prints help,
   the guard is not loaded, so stop.
3. With a board in lanes.json, `gh project view <number> --owner <owner>`
   succeeds; otherwise the token lacks the `project` scope, so stop.
Then invoke the `afk` skill by name (it is user-invoked only, so owner sessions
never load it). The owner is away: park instead of asking. Never
switch, pull, reset or stash this checkout: it may hold the owner's work.
```

- With `agentReview`, schedule a task invoking `agent-review`, naming the repository, how to wake the runner and any legacy review marker.
- Approve the task's tool prompts on its first run.
