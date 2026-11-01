# Setting Up Issue Lanes in a Repository

## Configuration: `.agents/config.json`

Use version 1; read it from base. AFK uses automated review; CODEOWNERS names the owner on owner-held paths.

```json
{
  "version": 1,
  "identities": {"owner": "alice", "implementer": "acme-builder", "reviewer": "acme-reviewer"},
  "github": {"repo": "acme/app", "base": "main", "project": {"owner": "acme", "number": 3}},
  "afk": {"alwaysInScope": ["docs/"]}
}
```

Keep only repository-specific facts in this file: GitHub repo and board, actor identities, path-specific AFK restrictions and exploration targets. The CLI supplies conventional AFK defaults, including Pi with Ollama, four concurrent runs, labels, and `.agents/personas.md`. Commands that genuinely vary by host can be overridden here as argv arrays. The foreground watcher holds the workflow lock until its command exits. Keep path ownership in CODEOWNERS.

## One-time setup

- Run `node <this-skill-directory>/../../scripts/workflow.mjs labels ensure` to create any missing standard labels. Existing labels are preserved.
- GitHub: apply [github-safety.md](github-safety.md) and run `node <this-skill-directory>/../../scripts/workflow.mjs safety check`. Exit 0 verifies CODEOWNERS; inspect effective protection, bypasses and production approval separately.

## Board

- Status columns Backlog, Todo, In progress, Review, Done; single-select Priority (P0, P1, P2). Existing board: add options, move every card, delete old options.
- Milestones group production outcomes or their linked health work; agents prioritize approved outcomes and health prerequisites.
- AFK runs without `project` scope.
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
