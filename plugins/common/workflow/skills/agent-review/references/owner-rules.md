# Owner Rules

`lanes.py triage <pr>` checks these in order and prints the first match. The list is closed: a PR matching none merges on green checks unless a review holds it with blocking findings.

| # | The PR | Configured by |
| --- | --- | --- |
| 1 | carries `review:owner` | |
| 2 | has an author other than the owner, the implementer or Dependabot | `owner`, `implementer` |
| 3 | lists no files, 100 or more, or a renamed or copied file | |
| 4 | touches a protected or owner path (automation, agent rules, security rules, stored data) | `protected`, `ownerPaths` |
| 5 | carries a label that ships or deploys on merge | `ownerLabels` |
| 6 | is a Dependabot update across a major version, or a minor one below 1.0 | |
| 7 | changes more lines beyond docs and tests than the limit | `ownerLines` (800) |
| 8 | changes code but closes no issue with a scope packet | |
| 9 | changes code outside its issues' scope packets and `alwaysInScope` | `alwaysInScope` |

## Verdicts

| `verdict=` | When | Review | `review:owner` |
| --- | --- | --- | --- |
| `ready` | No blocking finding or open thread; triage not `owner`. | APPROVE, then merge | remove |
| `owner` | No blocking finding; triage printed `owner` (quote the rule), or a thread waits on an owner check (device, credential). | COMMENT | add |
| `fixes` | Blocking findings, rounds left. | COMMENT | remove |
| `rounds` | Blocking findings in the last round. | COMMENT | add |

A verdict handing the owner a user-visible change links before and after captures of each change.
