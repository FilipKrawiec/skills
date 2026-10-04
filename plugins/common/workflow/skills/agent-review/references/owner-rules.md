# Owner Rules

`lanes.py triage <pr>` checks these in order and prints the first that matches. The list is closed: a PR that matches none lands without the owner on green checks, through the auto-merge the Open PR step switches on; a review that finds blocking issues holds anything that is not a chore (only docs, tests and Dependabot dependency files). Each rule reads data on the PR; none asks for judgement.

| # | The PR | Configured by |
| --- | --- | --- |
| 1 | carries `review:owner` (the owner asked for it, or the review rounds ran out) | |
| 2 | has an author other than the owner or Dependabot | `owner` |
| 3 | lists no files, 100 or more, or a renamed or copied file | |
| 4 | touches a protected or owner path (automation, agent rules, security rules, stored data) | `protected`, `ownerPaths` |
| 5 | carries a label that ships or deploys on merge | `ownerLabels` |
| 6 | is a Dependabot update across a major version, or a minor one below 1.0 | |
| 7 | changes more lines beyond docs and tests than the limit | `ownerLines` (800) |
| 8 | changes code but closes no issue with a scope packet | |
| 9 | changes code outside its issues' scope packets and `alwaysInScope` | `alwaysInScope` |

A finding is not an owner rule: blocking findings go back for fixes (`fixes`), and only findings still open in the last round add `review:owner` (`rounds`). A project makes its own risk areas owner rules by listing their paths in `ownerPaths`.
