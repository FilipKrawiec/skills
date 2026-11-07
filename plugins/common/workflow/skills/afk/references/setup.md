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

`afk.model` is optional; `steps.process` is `null`, `steps.assemble` an argv array or `null`, `steps.test` a non-empty argv array. Git derives repo/base; CODEOWNERS defines path owners and must name exactly one default Reviewer matching `identities.reviewer`; `verify` is the default check. Until the first config merges, `push --owner-bootstrap` reads a missing Owner from the branch's CODEOWNERS; afterwards, from base. The CLI caches the Project and `Review queue` issue for 24 hours in common `.git`; `cache show` and `cache refresh` manage it.

## One-time setup

- Run `node <this-skill-directory>/../../scripts/workflow.mjs labels ensure` to create missing labels.
- GitHub: apply [github-safety.md](github-safety.md) and run `node <this-skill-directory>/../../scripts/workflow.mjs safety check`. Exit 0 verifies CODEOWNERS; inspect effective protection, bypasses and production approval separately.

## Board

- Statuses Backlog, Todo, In progress, Blocked, Review, Done; single-select Priority (P0, P1, P2). Existing board: add options, move cards, delete old ones.
- Milestones group production outcomes or their health work; agents prioritize them.
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
| `state:claimed`, `state:started` | An AFK run, or another session, is on it. `state:started` over 30 minutes old is released when no live session sits on branch `<issue>-…`. |
| `state:reviewing` | The Reviewer's claim on a PR. |
| `review:owner` | PR for the owner; `agent-review` withholds approval. |
| `risk:R0`, `risk:R1`, `risk:R2` | One per PR; sizes review. |
| `type:story`, `type:bug`, `type:chore`, `type:task`, `type:epic` | One per issue. |

## Unattended runs

`node <this-skill-directory>/../../scripts/workflow.mjs afk install` installs the login watcher; each 60-second poll moves `.worktrees/afk-watch` to base and updates the CLI-owned tooling checkout (`afk.toolingDirectory`); never edit it. `afk.maxRuns` (4) caps live runs; each poll starts the first free unit: Blocked, Review, Todo, Backlog, then Priority. Blocked and Backlog get `refine`; shared files never hold a Todo build. A PR merged within 7 days without `## Lessons` gets one `improve` run after Review; a capped draft is never served. `afk.maxRunMinutes` (60) stops longer runs; a run's end stops its leftover processes, then removes clean, pushed worktrees. `afk.retros: bugs-when-empty` files `--retro` bugs only once other work closes. `afk uninstall` removes it.

Run `node <this-skill-directory>/../../scripts/workflow.mjs afk start --me <run id>`: exit 3 ends, 2 reports `Blocked:`, 4 starts an `explore` pass. Exit 0 holds one eligible issue in its worktree. End with `node <this-skill-directory>/../../scripts/workflow.mjs afk end --me <run id>`.

A cleanly exiting watcher run records its unit's state in `afk-spent.json` (git common directory); `afk end` records nothing. Until its state changes, polls skip it (`Unchanged: #N`); delete its key to re-offer.

- The orchestrator owns assignments/recovery; the host supplies routing and credentials.
- Production needs exact owner approval for candidate/destination. Notifications use only an authorized configured channel: a daily digest on queue changes, an immediate notice on incidents.
