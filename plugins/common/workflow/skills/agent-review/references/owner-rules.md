# Owner Rules

Read `gh pr view <pr> --json author,labels,title,body,closingIssuesReferences`, every changed path with `gh api repos/<repo>/pulls/<pr>/files --paginate --jq '.[] | [.filename, .previous_filename, .additions, .deletions]'` (a rename counts both paths), and each closed issue's scope packet; check in order and quote the first match. The list is closed: a PR matching none merges on your approval and green checks unless blocking findings hold it. GitHub's code-owner review enforces rule 4 for CODEOWNERS paths anyway; the label tells the owner.

| # | The PR | Configured by (lanes.json) |
| --- | --- | --- |
| 1 | carries `review:owner` | |
| 2 | has an author other than the owner, the implementer or Dependabot | `owner`, `implementer` |
| 3 | lists no files, or 3000 (the API's cap) | |
| 4 | touches a path `.github/CODEOWNERS` gives the owner, or an owner path (stored data, security rules) | `ownerPaths` |
| 5 | carries a label that ships or deploys on merge | `ownerLabels` |
| 6 | is a Dependabot update across a major version, or a minor one below 1.0 (title and `Bumps`/`Updates` lines) | |
| 7 | changes more lines beyond docs and tests than the limit | `ownerLines` (800) |
| 8 | changes code but closes no issue with a scope packet | |
| 9 | changes code outside its issues' scope packets and `alwaysInScope` | `alwaysInScope` |

Docs (`docs/`, `*.md`), tests and Dependabot's manifests and lockfiles are not code for rules 7–9.

## Verdicts

| `verdict=` | When | Review | `review:owner` |
| --- | --- | --- | --- |
| `ready` | No blocking finding or open thread; no owner rule matches. | APPROVE; COMMENT when the reviewer authored the PR, and the owner merges | remove |
| `owner` | No blocking finding; an owner rule matches (quote it), or a thread waits on an owner check (device, credential). | COMMENT | add |
| `fixes` | Blocking findings, rounds left. | COMMENT | remove |
| `rounds` | Blocking findings in the last round. | COMMENT | add |

- Label: `gh pr edit <pr> --add-label review:owner` or `--remove-label review:owner`.
- Never switch auto-merge off: the required approval alone gates the merge, so an owner's approval lands an `owner` PR. After an APPROVE, `gh pr merge <pr> --squash --auto --match-head-commit <head>` keeps it on.

A verdict handing the owner a user-visible change links before and after captures of each change.
