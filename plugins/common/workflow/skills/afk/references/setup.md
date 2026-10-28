# Setting Up Issue Lanes in a Repository

## Configuration: `.github/lanes.json`

`.github/lanes.json` opts in. Require `repo`, owner, implementer, reviewer and host capabilities. The configured Reviewer must be sole CODEOWNER on reviewable paths; `ownerPaths` reserve owner decisions. Missing approval blocks merge, not preparation.

| Key | Meaning |
| --- | --- |
| `repo` | `owner/name`. |
| `owner` | The owner's login; default the repository owner. |
| `implementer`, `reviewer` | Distinct GitHub identities; set both explicitly, never default to `owner`. |
| `base` | Default `main`. |
| `project` | `{"owner": "<login>", "number": <n>}`: the board. |
| `alwaysInScope` | Path prefixes every AFK change may touch. |
| `branchPrefix`, `staleClaimHours` | Defaults `agent/afk-`, `3`. |
| `agentReview`, `reviewRounds` | AFK PR review; cap rounds. Defaults `false`, `3`; required Reviewer gates still apply. |
| `ownerPaths`, `ownerLabels` | Additional owner holds: paths, ship-on-merge labels. |
| `ownerLines` | `refine` slice limit (800); not an owner hold. |
| `reviewQueue` | Issue `agent-review` pins as the owner's queue. |
| `reviewerLanes` | `true`: `agent-review` approves AFK eligibility; orchestrator applies lane/board changes through `spec`. |
| `maxRuns` | Live-run cap; unset, one run per epic. |

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
- GitHub: apply [github-safety.md](github-safety.md) and run `bash scripts/github-safety.sh check <owner/repo> <owner> <implementer> <reviewer> <check>...` from the installed skill. Exit 0 verifies CODEOWNERS; inspect effective protection, bypasses and production approval separately.

## Board

- Status columns Backlog, Todo, In progress, Review, Done; single-select Priority (P0, P1, P2). Existing board: add options, move every card, delete old options.
- Milestones group production outcomes or their linked health work; agents prioritize approved outcomes and health prerequisites.
- `gh auth refresh -s project`.
- Workflow: auto-add → Backlog. Do not automate PR-linked, reopened or closed status changes; the orchestrator applies readiness-aware transitions under `spec`.
- Default view:

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

Schedule runs in one host's checkout:

Run the plugin's `skills/afk/scripts/lanes.py start --me <run id> --runs <command>`: exit 3 ends, 2 reports `Blocked:`, 4: `explore`. Exit 0 holds an issue no live run holds, else an epic; invoke `afk` on it; never change the main checkout. End with `lanes.py end`.


- When `agentReview` automates PR review, assign a fresh native Reviewer task naming repository, configured GitHub identity and authorized runner wake mechanism.
- The orchestrator owns assignments/recovery; the host supplies routing, coordination and credentials. Labels are not atomic locks. Shared-host subagents give context independence, not secret isolation. Craftsman never exercises reviewer authority.
- Production needs exact owner approval for candidate/destination; branch restrictions alone do not grant it. Notifications use only an authorized configured channel; queue changes produce a daily changed digest, incidents/all-work-blocked an immediate notice.
