# Setting Up Issue Lanes in a Repository

## Configuration: `.github/lanes.json`

Its presence opts the repository in; agents read it from the base branch. Require explicit repo, owner, implementer and reviewer identities plus host capabilities. Put paths reserved for owner decisions in `ownerPaths`; CODEOWNERS defines the required GitHub Reviewer gate.

| Key | Meaning |
| --- | --- |
| `repo` | `owner/name`. |
| `owner` | The owner's login; default the repository owner. |
| `implementer`, `reviewer` | Distinct [machine users](github-safety.md); set both explicitly, never default to `owner`. |
| `base` | Default `main`. |
| `project` | `{"owner": "<login>", "number": <n>}`: the board. |
| `alwaysInScope` | Path prefixes every AFK change may touch. |
| `branchPrefix`, `staleClaimHours` | Defaults `agent/afk-`, `3`. |
| `agentReview`, `reviewRounds` | `true` when `agent-review` reviews open PRs; rounds cap per PR. Defaults `false`, `3`. |
| `ownerPaths`, `ownerLabels`, `ownerLines` | `agent-review`'s additional owner holds: paths, ship-on-merge labels, line limit (800). |
| `reviewQueue` | Issue `agent-review` pins as the owner's queue. |
| `reviewerLanes` | `true` lets `agent-review` move AFK-ready `lane:proposed` issues to `lane:afk`. |

```json
{
  "repo": "acme/app",
  "project": {"owner": "acme", "number": 3},
  "owner": "alice",
  "implementer": "acme-builder",
  "reviewer": "acme-reviewer",
  "alwaysInScope": ["docs/"],
  "agentReview": true
}
```

## One-time setup

- Create each missing label below with `gh label create <name> --color <hex> --description "<text>"`.
- GitHub: apply [github-safety.md](github-safety.md); from the installed `afk` skill directory run `bash scripts/github-safety.sh check <owner/repo> <owner> <implementer> <reviewer> <check>...`. Exit 0 also confirms the Reviewer is sole owner in every CODEOWNERS rule; verify production approval separately.

## Board

- Status columns Backlog, Todo, In progress, Review, Done; single-select Priority (P0, P1, P2). Existing board: add options, move every card, delete old options.
- Milestones group production outcomes or their linked health work; agents prioritize approved outcomes and health prerequisites.
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
| `lane:afk` | Approved for AFK. |
| `lane:proposed` | Agent recommends AFK. |
| `lane:owner` | Owner participation is required to implement. |
| `state:claimed`, `state:started` | An AFK run, or another session, is on it. |
| `review:owner` | PR for the owner; `agent-review` withholds approval. |
| `type:story`, `type:bug`, `type:chore`, `type:task`, `type:epic` | One per issue. |

## Unattended runs

Schedule runs in the main checkout so they never overlap. Prompt:

Preflight: verify the repository, isolated implementer identity (`gh api user --jq .login`), HTTPS push remote and configured project access. Invoke `afk`; never switch, pull, reset or stash the main checkout. Diagnose/replan/wait within approved constraints and retain lanes; ask only for reserved decisions.


- With agentReview, schedule an isolated reviewer task naming repository and authorized runner wake mechanism.
- Host owns model routing, enforced claims and credential isolation. Serialize until proven; parallel work requires disjoint enforced scopes including tests/dependencies. Label read/write is not atomic. Reviewer credentials must be inaccessible to craftsman; shared token-store selection is insufficient.
- Production needs exact owner approval for candidate/destination; branch restrictions alone do not grant it. Notifications use only an authorized configured channel; queue changes produce a daily changed digest, incidents/all-work-blocked an immediate notice.
