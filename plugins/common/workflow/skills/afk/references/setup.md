# Setting Up Issue Lanes in a Repository

## Configuration: `.agents/config.json`

Use version 1; read it from base. AFK uses automated review; the native code owner approves. CODEOWNERS names the reviewer on ordinary paths and owner on held paths.

```json
{
  "version": 1,
  "identities": {"owner": "alice", "implementer": "acme-builder", "reviewer": "acme-reviewer"},
  "github": {"repo": "acme/app", "base": "main", "project": {"owner": "acme", "number": 3}, "requiredChecks": ["Verify / verify"]},
  "afk": {
    "runPrefix": "acme-afk-",
    "runsCommand": ["agent-cli", "agents", "--json"],
    "startCommand": ["agent-cli", "--background", "--name", "{runId}", "--permission-mode", "{permissionMode}", "--model", "{model}", "{prompt}"],
    "stopCommand": ["agent-cli", "stop", "{id}"],
    "environmentFile": "~/.agent/settings.json",
    "stateFile": "~/.agent/jobs/{id}/state.json",
    "serviceLabel": "acme.afk-watch",
    "model": "coding-model",
    "permissionMode": "auto",
    "watchIntervalSeconds": 60,
    "waitTimeoutMinutes": 10,
    "pluginUpdateCommands": [],
    "pluginUpdateIntervalMinutes": 30,
    "reviewerApprovesAfk": true,
    "maxRuns": 4,
    "alwaysInScope": ["docs/"]
  }
}
```

This is the only repository-level workflow configuration. `github` accepts `repo`, `base`, `project`, `reviewQueue`, `requiredChecks` and optional `releaseAppId`; `afk` accepts `branchPrefix`, `runPrefix`, `runsCommand`, `startCommand`, `stopCommand`, `environmentFile`, `stateFile`, `serviceLabel`, `model`, `permissionMode`, `agentModels`, `watchIntervalSeconds`, `waitTimeoutMinutes`, `pluginUpdateCommands`, `pluginUpdateIntervalMinutes`, `staleClaimHours`, `reviewRounds`, `reviewerApprovesAfk`, `maxRuns`, `alwaysInScope` and `ownerLines`. `agentModels` maps role names to `model` and optional `reasoningEffort`; `reviewFix.fromRound` starts escalation. Commands are argv arrays; `startCommand` supports `{runId}`, `{prompt}`, `{model}`, `{permissionMode}`, `{cliPath}` and `{repository}`. `explore` holds target and scheduling settings. Identity, project and AFK settings go here; path ownership stays in CODEOWNERS.

## One-time setup

- Create each missing label below with `gh label create <name> --color <hex> --description "<text>"`.
- GitHub: apply [github-safety.md](github-safety.md) and run `node <this-skill-directory>/../../scripts/workflow.mjs safety check`. Exit 0 verifies CODEOWNERS; inspect effective protection, bypasses and production approval separately.

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

Install the host watcher with `node <this-skill-directory>/../../scripts/workflow.mjs afk install`. The CLI installs launchd from config and maintains a dedicated worktree. Remove the job with `afk uninstall`; the worktree is preserved.

Run `node <this-skill-directory>/../../scripts/workflow.mjs afk start --me <run id>`: exit 3 ends, 2 reports `Blocked:`, 4 starts an `explore` pass. Exit 0 holds one eligible issue; invoke `afk` on it in an isolated worktree and never change the main checkout. End with `node <this-skill-directory>/../../scripts/workflow.mjs afk end --me <run id>`.


- For every AFK PR, assign a fresh native Reviewer task naming repository, configured GitHub identity and authorized runner wake mechanism.
- The orchestrator owns assignments/recovery; the host supplies routing, coordination and credentials. Labels are not atomic locks. Shared-host subagents give context independence, not secret isolation. Craftsman never exercises reviewer authority.
- Production needs exact owner approval for candidate/destination; branch restrictions alone do not grant it. Notifications use only an authorized configured channel; queue changes produce a daily changed digest, incidents/all-work-blocked an immediate notice.
