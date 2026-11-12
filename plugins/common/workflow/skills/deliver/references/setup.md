# Setting up a repository for drive

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

`steps.process` is `null`, `steps.assemble` an argv array or `null`, `steps.test` a non-empty argv array; `check` runs `steps.test`. Git derives repo/base; CODEOWNERS defines path owners and must name exactly one default Reviewer matching `identities.reviewer`; `verify` is the default check. Until the first config merges, `push --owner-bootstrap` reads a missing Owner from the branch's CODEOWNERS; afterwards, from base. The CLI caches the Project for 24 hours in common `.git`; `cache show` and `cache refresh` manage it.

## One-time setup

- Run `node <this-skill-directory>/../../scripts/workflow.mjs labels ensure` to create missing labels.
- GitHub: apply [github-safety.md](github-safety.md) and run `node <this-skill-directory>/../../scripts/workflow.mjs safety check`. Exit 0 verifies CODEOWNERS; inspect effective protection, bypasses and production approval separately.

## Board

- Statuses Backlog, Todo, In progress, Blocked, Review, Done; single-select Priority (P0, P1, P2). Existing board: add options, move cards, delete old ones.
- Milestones group production outcomes or their health work; agents prioritize them.
- `drive` moves cards when its token has `project` scope and skips the move otherwise.
- Workflow: auto-add → Backlog. Do not automate PR-linked, reopened or closed status changes; `drive` and the orchestrator apply readiness-aware transitions under `spec`.
- Default view:

| View | Layout | Filter | Fields |
| --- | --- | --- | --- |
| Epics | Table | `label:"type:epic" -status:Done` | Title, Status, Priority, Sub-issues progress, Parent issue |
| Board | Board by Status | `-label:"type:epic"` | Title, Labels, Priority, Parent issue, Linked pull requests |

## Labels

| Label | Meaning |
| --- | --- |
| `lane:owner` | Owner participation is required to implement. |
| `state:started` | `drive` started the issue in the owner's session. |
| `state:reviewing` | The Reviewer's claim on a PR. |
| `review:owner` | PR for the owner after the Reviewer's approval: `review` approves it with `verdict=owner`, `pr auto-merge` waits for the owner's approval of the head. |
| `risk:R0`, `risk:R1`, `risk:R2` | One per PR; picks the models and whether the owner reviews. |
| `nits:swept` | A merged PR whose review Nits were swept. |
| `type:story`, `type:bug`, `type:chore`, `type:task`, `type:epic` | One per issue. |

Production needs exact owner approval for candidate and destination.
