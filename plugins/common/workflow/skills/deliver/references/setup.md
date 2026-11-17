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

`steps.process` is `null`, `steps.assemble` an argv array or `null`, `steps.test` a non-empty argv array; `check` runs `steps.test`. Git derives repo/base; CODEOWNERS defines path owners and must name exactly one default Reviewer matching `identities.reviewer`; `verify` is the default check. Once the Reviewer approves a PR touching a path whose CODEOWNERS owner is not that Reviewer, `drive` returns an `owner` step with the PR link and those paths; every other approval merges. Until the first config merges, `push --owner-bootstrap` reads a missing Owner from the branch's CODEOWNERS; afterwards, from base. The CLI caches the Project for 24 hours in common `.git`; `cache show` and `cache refresh` manage it.

Configure `delivery` as documented in the project installation guidance. Verify the host can dispatch, select the model and return an intact hand-back. The reviewer credential and exact-head approval remain mandatory.

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
| `review:owner` | PR for the owner after the Reviewer's approval: `review` approves it with `verdict=owner` only for an owner-reserved effect, `pr auto-merge` waits for the owner's approval of the head. |
| `risk:R0`, `risk:R1`, `risk:R2` | One per PR, set by `drive` from the `devops` risk assessment of the diff, which reasons about the change, never its paths; picks the implementer's model and the implementer's and Reviewer's effort, never whether the owner reviews. On an issue, only the owner sets one, as a floor. |
| `nits:swept` | A merged PR whose review Nits were swept. |
| `type:story`, `type:bug`, `type:chore`, `type:task`, `type:epic` | One per issue. |

Production needs exact owner approval for candidate and destination.

Require configured status checks on branches up to date with the base in branch protection or the active ruleset. Drive cannot safely enable auto-merge without that setting.

The project owns shared hardware verification: its test command must hold one machine-wide advisory lock per device for the entire run, including setup and cleanup. Use the same lock path for each device across checkouts and acquire multiple device locks in a consistent order. The workflow check slots only limit concurrent gates; they do not protect a device.
