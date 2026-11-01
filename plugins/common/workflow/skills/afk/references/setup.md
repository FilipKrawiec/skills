# Setting Up Issue Lanes in a Repository

## Configuration: `.github/agent-workflow.json`

Configure identities, GitHub project, AFK and optional exploration in version 1. Read from the trusted base. AFK always uses automated review; the native code owner separately approves. CODEOWNERS names the reviewer for ordinary paths and the owner alone for owner-held paths.

```json
{
  "version": 1,
  "identities": {"owner": "alice", "implementer": "acme-builder", "reviewer": "acme-reviewer"},
  "github": {"repo": "acme/app", "project": {"owner": "acme", "number": 3}},
  "afk": {"reviewerApprovesAfk": true, "maxRuns": 4, "alwaysInScope": ["docs/"]}
}
```

`github` also accepts `base` and `reviewQueue`. `afk` accepts `branchPrefix`, `staleClaimHours`, `reviewRounds`, `reviewerApprovesAfk`, `maxRuns`, `alwaysInScope` and `ownerLines`. `explore` holds the exploration targets and scheduling.

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


- For every AFK PR, assign a fresh native Reviewer task naming repository, configured GitHub identity and authorized runner wake mechanism.
- The orchestrator owns assignments/recovery; the host supplies routing, coordination and credentials. Labels are not atomic locks. Shared-host subagents give context independence, not secret isolation. Craftsman never exercises reviewer authority.
- Production needs exact owner approval for candidate/destination; branch restrictions alone do not grant it. Notifications use only an authorized configured channel; queue changes produce a daily changed digest, incidents/all-work-blocked an immediate notice.
