# GitHub Safety Setup

GitHub enforces what agents may do; no hook or skill text is the boundary. Run `scripts/github-safety.sh check <owner/repo> <owner> <implementer> <reviewer> <check>...` before enabling unattended runs; it exits 1 and lists each drift. `apply` with the same arguments fixes everything but the owner-only steps below.

## Identities

| Who | Account | Repository role | Token |
| --- | --- | --- | --- |
| Owner | the owner's account | Admin, code owner | the owner's own |
| Implementer (`afk`, attended sessions that push) | machine user | Write | classic PAT: `repo`, `project`, `read:org`; never `workflow`, `admin:*` |
| Reviewer (`agent-review`) | a second machine user | Write | classic PAT: `repo`, `project`, `read:org` |

- Add both machine users as collaborators with Write and as Write collaborators on the board's Project; name them in lanes.json's `implementer` and `reviewer`.
- Agents act as implementer: `GH_CONFIG_DIR=<dir> gh auth login --with-token` both machine users (implementer last); agents set `GH_CONFIG_DIR=<dir>`, `GIT_CONFIG_COUNT`: `url.https://github.com/.pushInsteadOf=git@github.com:`, `credential.https://github.com.helper=`, `!gh auth git-credential`.
- Never give an agent the owner's token.
- Without `workflow` scope a push that changes `.github/workflows/` fails, so an agent cannot rewrite CI.

## Branch protection on the base branch

| Setting | Value | Why |
| --- | --- | --- |
| Required approvals | 1 | Someone other than the author approves. |
| Require approval of the most recent push | on | The implementer cannot approve its own last push. |
| Require review from code owners | on | Owner paths need the owner. |
| Dismiss stale approvals | on | A new push needs a new approval. |
| Required status checks | the project's CI checks | |
| Conversation resolution, linear history | on | |
| Force pushes, deletions | off | |
| Include administrators | off | The owner merges their own PRs. |

## Repository settings

- Squash merge only, auto-merge allowed, delete head branches on merge.
- Actions: default workflow token read-only; Actions may not approve pull requests.
- No repository-level secrets; deploy and release secrets live in environments.
- Each environment requires the owner as reviewer, or custom deployment policies naming only the base branch and `v*` tags.
- An active tag ruleset keeps `v*` tags to admins, so only the owner can start a tag deploy.
- Create the machine users first: `apply` skips required reviews until both exist, else the owner could not merge their own PRs.

## `.github/CODEOWNERS` (owner-only, on the base branch)

```text
/.github/      @<owner>
/AGENTS.md     @<owner>
/justfile      @<owner>
```

Add every path the owner must see: security rules, stored data shapes, migrations, agent instructions, release config.

## What this gives

| Action | Who can |
| --- | --- |
| Merge a PR an owner rule matches | after the owner approves |
| Merge any other agent PR | the reviewer, when it judges the owner unneeded: it approves, then merges once checks pass; otherwise it withholds approval and adds `review:owner` |
| Merge the owner's own PR | the owner, bypassing review as admin, or after the reviewer approves |
| Push to the base branch, change settings, protection or collaborators | owner only |
| Change CI workflows | owner only (token scope plus CODEOWNERS) |
| Read deploy secrets, release, deploy | from a merged base branch, an owner tag, or the owner's environment approval |

Local safety (never editing the owner's main checkout) is not GitHub's; every session works in its own worktree as `board.md`'s Start here says.
