# Owner Rules

Read `gh pr view <pr> --json author,labels,files,title,body,closingIssuesReferences` and each closed issue's scope packet; check in order and quote the first match. The list is closed: a PR matching none merges on your approval and green checks unless blocking findings hold it. GitHub's code-owner review enforces rule 3 for CODEOWNERS paths anyway; the label tells the owner.

| # | The PR | Configured by (lanes.json) |
| --- | --- | --- |
| 1 | carries `review:owner` | |
| 2 | has an author other than the owner, the implementer or Dependabot | `owner`, `implementer` |
| 3 | touches a path `.github/CODEOWNERS` gives the owner, or an owner path (stored data, security rules), including a rename's old path | `ownerPaths` |
| 4 | carries a label that ships or deploys on merge | `ownerLabels` |
| 5 | is a Dependabot update across a major version, or a minor one below 1.0 (title and `Bumps`/`Updates` lines) | |
| 6 | changes more lines beyond docs and tests than the limit | `ownerLines` (800) |
| 7 | changes code but closes no issue with a scope packet | |
| 8 | changes code outside its issues' scope packets and `alwaysInScope` | `alwaysInScope` |

Docs (`docs/`, `*.md`), tests and Dependabot's manifests and lockfiles are not code for rules 6–8.

## Verdicts

| `verdict=` | When | Review | `review:owner` | Auto-merge |
| --- | --- | --- | --- | --- |
| `ready` | No blocking finding or open thread; no owner rule matches. | APPROVE; COMMENT when the reviewer authored the PR, and the owner merges | remove | on once approved |
| `owner` | No blocking finding; an owner rule matches (quote it), or a thread waits on an owner check (device, credential). | COMMENT | add | off |
| `fixes` | Blocking findings, rounds left. | COMMENT | remove | off |
| `rounds` | Blocking findings in the last round. | COMMENT | add | off |

- Label: `gh pr edit <pr> --add-label review:owner` or `--remove-label review:owner`.
- On: `gh pr merge <pr> --squash --auto --match-head-commit <head>`; GitHub merges once checks pass. Off: `gh pr merge <pr> --disable-auto`; "not enabled" is fine.

A verdict handing the owner a user-visible change links before and after captures of each change.
