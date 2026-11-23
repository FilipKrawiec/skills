# Setting up a repository for drive

Run `node <this-skill-directory>/../../scripts/workflow.mjs init` once, as the owner, in the project (`--dry-run` previews; add `--implementer LOGIN --reviewer LOGIN` and `--test "COMMAND"` when no config exists and no justfile or npm test is found). It merges the standing-approval `autoMode` into the user-level agent settings, enables marketplace auto-update, writes a missing config and Reviewer-only CODEOWNERS, runs `labels ensure` and `safety check`, and lists what failed. Nothing else is configured by hand.

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

`steps.process` is `null`, `steps.assemble` an argv array or `null`, `steps.test` a non-empty argv array; `check` runs `steps.test`. Git derives repo/base; CODEOWNERS names exactly one default Reviewer matching `identities.reviewer` and, by default, nothing else; `verify` is the default check. Owner: `identities.owner`, else a user repository owner, else commands fail; `init` writes it. A path CODEOWNERS still gives an owner makes `drive` return an `owner` step after approval; every other approval merges. Until the first config merges, `push --owner-bootstrap` reads `identities.owner` from the branch's config; afterwards, from base. The CLI caches the Project 24 hours; `cache show|refresh` manages it.

Verify the host can dispatch and return an intact hand-back; the reviewer credential and exact-head approval stay mandatory.

## GitHub

- Apply [github-safety.md](github-safety.md) and run `node <this-skill-directory>/../../scripts/workflow.mjs safety check`. Exit 0 verifies CODEOWNERS; inspect effective protection, bypasses and production approval separately.

## Board

- Statuses Backlog, Todo, In progress, Blocked, Review, Done; single-select Priority (P0, P1, P2).
- Milestones group production outcomes or their health work; agents prioritize them.
- Workflow: auto-add → Backlog. Do not automate PR-linked, reopened or closed status changes; `drive` and the owner's session apply readiness-aware transitions under `spec`.
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
| `type:epic`, `type:story`, `type:bug` | One per issue; epics never nest. |

Require configured status checks on branches up to date with the base in branch protection or the active ruleset. Drive cannot safely enable auto-merge without that setting.

The project owns shared hardware verification: its test command must hold one machine-wide advisory lock per device for the entire run, including setup and cleanup. Use one lock path per device across checkouts; acquire several in a consistent order. Check slots limit gates, not devices.

## Start the drive session

Start it on Sonnet at low effort (launch command in `docs/CONCEPTS.md`); never raise either.
