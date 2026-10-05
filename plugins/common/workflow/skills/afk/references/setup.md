# Setting Up Issue Lanes in a Repository

## Configuration: `.github/lanes.json`

Its presence opts the repository in (the guard hook is inactive elsewhere). Lists extend the defaults in `scripts/lanes.py`; scalars replace them.

| Key | Required | Meaning |
| --- | --- | --- |
| `repo` | yes | `owner/name` on GitHub. |
| `owner` | no | Login whose PRs may auto-merge; defaults to the repository owner. |
| `base` | no | Base branch; default `main`. |
| `project` | no | `{"owner": "<login>", "number": <n>}`: the board whose cards the skills and its workflows move, epics included. |
| `protected` | no | Regexes for paths agents may not change in AFK work (adds to every top-level dot-directory, `AGENTS.md`, justfile and Makefile). Add the host's own instruction file here when it has one besides `AGENTS.md`. |
| `alwaysInScope` | no | Path prefixes every AFK change may touch, e.g. the user guide the project rules require updating. |
| `chores` | no | Regexes of paths that auto-merge on green checks (adds to `^docs/`, `\.md$`, test directories). |
| `dependencyFiles` | no | Regexes of manifests and lockfiles that auto-merge when Dependabot changed them, unless the PR crosses a major version (or a minor one below 1.0): those stay open for the owner. |
| `branchPrefix`, `staleClaimHours` | no | Defaults `agent/afk-`, `3`. |
| `agentReview`, `reviewRounds` | no | `true` when the `agent-review` skill reviews open PRs. A PR that matches no owner rule auto-merges on green checks either way; the reviewer holds one with blocking findings (`lanes.py hold`) and adds `review:owner` to the rest. `reviewRounds` caps reviews per PR. Defaults `false`, `3`. |
| `ownerPaths`, `ownerLabels`, `ownerLines` | no | The project's owner rules beyond `protected`: regexes of paths whose change the owner sees (security rules, stored data shapes, migrations), labels that ship or deploy on merge, and the most changed lines beyond docs and tests (default 800). `lanes.py triage` applies the whole closed list in the `agent-review` skill's owner rules reference. |
| `guard` | no | Extra caught commands: `[{"pattern": "<regex>", "reason": "<why>"}]`, e.g. deploy commands. Each pattern is searched in every command a call runs, its quoted prose and tools that run none of their arguments (`cat`, `grep`, `echo`...) left out, so mentioning a command never trips it. |

Minimal example:

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

| Step | Command or setting |
| --- | --- |
| Labels | `gh label create <name> --color <hex> --description "<text>"` for each label below that the repository lacks. |
| Board | Optional. Give the Project's Status field the columns in [board.md](../../../references/board.md), turn on the workflows it lists, add its Priority field and create its views (Views there). On a board with other Status options, add the new ones, move each card to its state's column, then delete the old options, so no card loses its Status. The token that runs agents needs the `project` scope: `gh auth refresh -s project`. |
| Protection | Require the CI check, linear history, squash merges and auto-merge in the repository settings; the guard leaves merging to `lanes.py merge` and the owner. |
| Guard | Hosts that load plugin hooks run `scripts/guard.py` before every shell command, file edit and GitHub tool call once the plugin is enabled; on other hosts the skill text is the guard. It refuses a caught call in a scheduled run and asks the owner in an attended session, except in a bypass permission mode, which approves asks unseen. |
| Rules | Add one line to the project's agent rules: issues, lanes, the board, worktrees, branches, PRs, reviews and merges follow the workflow plugin's skills, with a link to the project's workflow page, which holds only the project's values. |

## Labels

| Label | Meaning |
| --- | --- |
| `lane:afk` | Owner-approved: an agent may deliver it unattended. |
| `lane:proposed` | An agent recommends AFK; the owner decides. |
| `lane:owner` | Needs the owner: a decision, credentials, settings or a device. |
| `state:claimed` | An AFK run is working on it now. |
| `state:started` | Another session is working on it now. |
| `state:parked` | An AFK run handed it back with a question. |
| `review:owner` | PR: an owner rule matched (`lanes.py triage` printed `owner`) or the review rounds ran out; `lanes.py merge` leaves it. |
| `type:story`, `type:bug`, `type:chore`, `type:task`, `type:epic` | The issue's type, exactly one per issue; Issue types in [board.md](../../../references/board.md) says which. |

Priority, the board's columns, the commands that move a card and the claim, park and tidy steps are in [board.md](../../../references/board.md).

With `agentReview`, the reviewer adds `review:owner` to a PR when `lanes.py triage` prints `owner` or the review rounds run out, and removes it when it asks for fixes again.

## Unattended runs

A scheduler that starts an agent session in the repository's main checkout runs this skill. Schedule runs so they never overlap: two runs at once can both claim the issue `next` printed. Give its prompt a fail-closed preflight:

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

The checkout may be on any branch, dirty or behind. `lanes.py` fetches the base
branch and reads `lanes.json` and the file list from `origin/<base>`, and every
build and fix happens in a worktree made from it, so the owner's work and an AFK
run never meet. The plugin's guard and settings load from the checkout at
session start; enabling the plugin on `main` is enough.

With `agentReview`, schedule a second task with the `agent-review` skill. Its prompt names the repository, how to wake the runner (or that the runner has its own schedule) and any legacy review marker; the skill holds the rest.

Approve the task's tool prompts on its first run so later runs don't stall. Runs share the owner's OS account and credentials. The guard, lane rules and branch protection bound what they can do; they are not an isolation boundary.
