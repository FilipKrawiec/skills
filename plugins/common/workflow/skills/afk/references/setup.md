# Setting Up Issue Lanes in a Repository

## Configuration: `.github/lanes.json`

Its presence opts the repository in (the guard hook is inactive elsewhere). Lists extend the defaults in `scripts/lanes.py`; scalars replace them.

| Key | Required | Meaning |
| --- | --- | --- |
| `repo` | yes | `owner/name` on GitHub. |
| `owner` | no | Login whose PRs may auto-merge; defaults to the repository owner. |
| `base` | no | Base branch; default `main`. |
| `project` | no | `{"owner": "<login>", "number": <n>}` for `board`. |
| `protected` | no | Regexes for paths agents may not change in AFK work (adds to every top-level dot-directory, `AGENTS.md`, justfile and Makefile). Add the host's own instruction file here when it has one besides `AGENTS.md`. |
| `alwaysInScope` | no | Path prefixes every AFK change may touch, e.g. the user guide the project rules require updating. |
| `chores` | no | Regexes of paths that auto-merge on green checks (adds to `^docs/`, `\.md$`, test directories). |
| `dependencyFiles` | no | Regexes of manifests and lockfiles that auto-merge when Dependabot changed them, unless the PR crosses a major version (or a minor one below 1.0): those stay open for the owner. |
| `worktrees`, `branchPrefix`, `staleClaimHours` | no | Defaults `.worktrees`, `agent/afk-`, `3`. |
| `agentReview`, `reviewRounds` | no | `true` when the `agent-review` skill reviews PRs before the owner; it adds `review:owner` to a PR it hands to the owner, and `lanes.py merge-reviewed` may merge AFK PRs it judged ready. `reviewRounds` caps reviews per PR. Defaults `false`, `3`. |
| `labels`, `renames` | no | Extra labels `{"name": {"color", "description"}}` and renames `{"old": "new"}`; `labels` deletes everything else. |
| `guard` | no | Extra blocked commands: `[{"pattern": "<regex>", "reason": "<why>"}]`, e.g. deploy commands. |

Minimal example:

```json
{
  "repo": "acme/app",
  "project": {"owner": "acme", "number": 3},
  "protected": ["^infra/"],
  "alwaysInScope": ["docs/"],
  "guard": [{"pattern": "\\bnpm\\s+run\\s+deploy\\b", "reason": "Deploys run from CI."}]
}
```

## One-time setup

| Step | Command or setting |
| --- | --- |
| Labels | `lanes.py labels`, review, then `--apply` (creates `lane:*`, the `state:*` labels, `review:owner`, `type:epic` plus yours). |
| Board | Optional; `lanes.py board --apply` rewrites the Status options to the phases below. Lanes stay as labels; show them on cards once in the board view's field settings (the API cannot change views). |
| Protection | Require the CI check, linear history, squash merges and auto-merge in the repository settings; the guard assumes the owner merges everything that is not a chore. |
| Guard | Hosts that load plugin hooks run `scripts/guard.py` before every shell command once the plugin is enabled; on other hosts the skill text is the guard. |
| Rules | Add to the project's agent rules: "New work starts with `define`; `spec` decides its lane", "Starting on an issue outside an AFK build: `lanes.py start N`, then `plan`; pausing or handing off: `lanes.py release N`" and a link to the project's workflow page. |

## Board lifecycle

One column per phase of the delivery cycle. Lanes stay labels on the cards.

| Status | When |
| --- | --- |
| 01 Define | Open, no `### Acceptance criteria` section yet. |
| 02 Spec | Has acceptance criteria and is not started. `lane:afk` waits for a run; `lane:proposed` and `state:parked` wait on the owner (re-applying `lane:afk` hands a parked issue back; the next claim clears `state:parked`). |
| 03 Plan | `state:claimed` (an AFK build) or `state:started` (any other session), without `state:planned`. |
| 04 Execute | Started and `state:planned` (`lanes.py mark N planned` after the plan comment). |
| 05 Review | An open PR closes it. `review:owner` on the PR means it waits on the owner. Takes precedence over 03 and 04. |
| 06 Ship | Closed as completed with `state:planned`: merged, base-branch health not yet confirmed. |
| 07 Improve | `state:shipped` (`lanes.py health --apply` once the base branch is green after the merge): lessons are due. |
| Done | `state:learned` (`lanes.py mark N learned`), closed as not planned, or closed without a phase marker. |

With `agentReview`, the reviewer adds `review:owner` to a PR when it hands it to the owner (passed but needs the owner, or out of review rounds) and removes it when it asks for fixes again.

## Unattended runs

A scheduler that starts an agent session in the repository's main checkout runs this skill. Give its prompt a fail-closed preflight:

```text
Preflight, stop and report on any failure:
1. The working directory is inside <owner>/<repo>.
2. `gh pr merge --help` is refused by the issue-lanes guard; if it prints help,
   the guard is not loaded, so stop.
Then use the `afk` skill. The owner is away: park instead of asking. Never
switch, pull, reset or stash this checkout: it may hold the owner's work.
```

The checkout may be on any branch, dirty or behind. `lanes.py` fetches the base
branch and reads `lanes.json` and the file list from `origin/<base>`, and every
build and fix happens in a worktree made from it, so the owner's work and an AFK
run never meet. The plugin's guard and settings load from the checkout at
session start; enabling the plugin on `main` is enough.

With `agentReview`, schedule a second task with the `agent-review` skill. Its prompt names the repository, how to wake the runner (or that the runner has its own schedule) and any legacy review marker; the skill holds the rest.

Approve the task's tool prompts on its first run so later runs don't stall. Runs share the owner's OS account and credentials. The guard, lane rules and branch protection bound what they can do; they are not an isolation boundary.
