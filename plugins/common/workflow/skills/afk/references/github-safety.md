# GitHub Safety Setup

GitHub enforces what agents may do; no hook or skill text is the boundary. Run `scripts/github-safety.sh check <owner/repo> <owner> <implementer> <reviewer> <check>...` before enabling unattended runs; it exits 1 and lists each drift. `apply` with the same arguments fixes everything but the owner-only steps below.

## Identities

| Who | Account | Repository role | Token |
| --- | --- | --- | --- |
| Owner | the owner's account | Admin, code owner | the owner's own |
| Implementer (`afk`, attended sessions that push) | machine user | Write | classic PAT: `repo`, `project`; never `workflow`, `admin:*` |
| Reviewer (`agent-review`) | a second machine user | Write | classic PAT: `repo`, `project` |

- Add both machine users as collaborators with Write and as Write collaborators on the board's Project.
- Each agent host authenticates `gh` and `git` as its machine user (`GH_TOKEN`, a credential helper scoped to the repository). Never give an agent the owner's token.
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
- No repository-level secrets. Deploy and release secrets live in environments whose protection rule requires the owner as reviewer, so any workflow, dispatched or pushed, waits for the owner before it reads them.

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
| Merge a PR touching an owner path | after the owner approves |
| Merge any other PR | after the reviewer approves and checks pass; the implementer enables `gh pr merge --auto --squash` |
| Push to the base branch, change settings, protection or collaborators | owner only |
| Change CI workflows | owner only (token scope plus CODEOWNERS) |
| Read deploy secrets, release, deploy | after the owner approves the environment |

Local safety (never editing the owner's main checkout) is not GitHub's; every session works in its own worktree as `board.md`'s Start here says.
