# Critical PRs

A critical PR goes to the owner even when nothing blocks it. A PR is critical when it:

| Area | Examples |
| --- | --- |
| Security | Auth, roles, permissions, credentials or secrets. |
| Access and deployment config | Database or storage security rules, indexes, hosting or deployment configuration. |
| Stored data | A change to the persisted data shape, a migration, or anything that can lose or corrupt user data. |
| Protected paths | Any path lanes.json `protected` matches (by default dot-directories, `AGENTS.md`, the justfile or Makefile). |
| Automation and instructions | CI, the verification gate, agent instructions, skills or settings. |
| Releases | Release, deploy or signing changes, or a label that ships a build on merge. |
| Dependencies | A major version bump. |
| Ownership | Closing an issue that is not `lane:afk`. |
| Behaviour | Removing or changing behaviour users rely on beyond what its issue asks. |
| Size | More than about 800 changed lines of non-test code. |
| Rounds | Findings still open in the last review round. |

When unsure, treat the PR as critical.
