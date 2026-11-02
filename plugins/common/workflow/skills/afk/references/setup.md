# Setting Up Issue Lanes in a Repository

## Configuration: `.agents/config.json`

Use version 1; read it from base.

```json
{
  "version": 1,
  "identities": {"implementer": "acme-builder", "reviewer": "acme-reviewer"},
  "steps": {
    "process": null,
    "assemble": ["just", "dev", "{platform}"],
    "test": ["just", "quick"]
  }
}
```

`afk.model` is optional; `steps.process` is `null`, `steps.assemble` an argv array or `null`, `steps.test` a non-empty argv array. Git derives repo/base; CODEOWNERS defines path owners and must name exactly one default Reviewer matching `identities.reviewer`; `verify` is the default check. Until the first config merges, `push --owner-bootstrap` reads a missing Owner from the branch's CODEOWNERS; afterwards, from base. The CLI caches the linked Project and open `Review queue` issue for 24 hours in common `.git`; `cache show` and `cache refresh` manage it.

## One-time setup

- Run `node <this-skill-directory>/../../scripts/workflow.mjs labels ensure` to create any missing standard labels.
- GitHub: apply [github-safety.md](github-safety.md) and run `node <this-skill-directory>/../../scripts/workflow.mjs safety check`. Exit 0 verifies CODEOWNERS; inspect effective protection, bypasses and production approval separately.

## Board

- Statuses Backlog, Todo, In progress, Blocked, Review, Done; single-select Priority (P0, P1, P2). Existing board: add options, move every card, delete old options.
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
| `lane:proposed` | Changes requested behaviour or lacks authority. |
| `lane:owner` | Owner participation is required to implement. |
| `state:claimed`, `state:started` | An AFK run, or another session, is on it. |
| `review:owner` | PR for the owner; `agent-review` withholds approval. |
| `type:story`, `type:bug`, `type:chore`, `type:task`, `type:epic` | One per issue. |

## Unattended runs

`node <this-skill-directory>/../../scripts/workflow.mjs afk install` installs the login watcher; each 60-second poll moves `.worktrees/afk-watch` to base and updates the CLI-owned tooling checkout (`afk.toolingDirectory`); never edit it. `afk.maxRuns` (4) caps live runs; each poll starts one on the first free unit: Blocked, Review, Todo, Backlog, then Priority. Blocked and Backlog get `refine`. `afk.maxRunMinutes` (60) stops longer runs, process groups included. Each run's native worktree is removed once clean and pushed. `afk uninstall` removes the job.

Run `node <this-skill-directory>/../../scripts/workflow.mjs afk start --me <run id>`: exit 3 ends, 2 reports `Blocked:`, 4 starts an `explore` pass. Exit 0 holds one eligible issue; invoke `afk` on it in its own worktree. End with `node <this-skill-directory>/../../scripts/workflow.mjs afk end --me <run id>`.

A watcher run whose agent exits cleanly records its unit's state in `afk-spent.json` (git common directory); `afk end`, used by self-started runs, records nothing, as it cannot tell a finish from a release. Until the head, reviews, checks, merge state, base, column, labels or outside comments change, polls log `Unchanged: #N` and skip the unit; delete its key to re-offer it.

- An AFK PR's Reviewer is a fresh subagent of its implementer.
- The orchestrator owns assignments/recovery; the host supplies routing, coordination and credentials. Labels are not atomic locks.
- Production needs exact owner approval for candidate/destination; branch restrictions alone do not grant it. Notifications use only an authorized configured channel; queue changes produce a daily changed digest, incidents/all-work-blocked an immediate notice.
