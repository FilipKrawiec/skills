# Setting Up Issue Lanes in a Repository

## Configuration: `.github/lanes.json`

Its presence opts the repository in (the guard hook is inactive elsewhere). Lists extend the defaults in `scripts/lanes.py`; scalars replace them.

| Key | Required | Meaning |
| --- | --- | --- |
| `repo` | yes | `owner/name` on GitHub. |
| `owner` | no | Login whose PRs may auto-merge; defaults to the repository owner. |
| `base` | no | Base branch; default `main`. |
| `project` | no | `{"owner": "<login>", "number": <n>}` for `board`. |
| `protected` | no | Regexes for paths agents may not change in AFK work (adds to `.github/`, `.claude/`, `.agents/`, `.codex/`, AGENTS.md, CLAUDE.md, justfile, Makefile). |
| `alwaysInScope` | no | Path prefixes every AFK change may touch, e.g. the user guide the project rules require updating. |
| `chores` | no | Regexes of paths that auto-merge on green checks (adds to `^docs/`, `\.md$`, test directories). |
| `dependencyFiles` | no | Regexes of manifests and lockfiles that auto-merge when Dependabot changed them. |
| `worktrees`, `branchPrefix`, `staleClaimHours` | no | Defaults `.claude/worktrees`, `claude/afk-`, `3`. |
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
| Labels | `lanes.py labels`, review, then `--apply` (creates `lane:*`, `state:claimed`, `type:epic` plus yours). |
| Board | Optional; `lanes.py board --apply` rewrites the Status options to Triage, Proposed, Owner, AFK, Running, Review, Done. |
| Protection | Require the CI check, linear history, squash merges and auto-merge in the repository settings; the guard assumes the owner merges everything that is not a chore. |
| Guard | Enabling this plugin in Claude Code installs the PreToolUse hook. Hosts without hooks rely on the skill text alone. |
| Rules | Add to the project's agent rules: "Before creating an issue, ask the owner whether it is AFK" and a link to the project's workflow page. |

## Unattended runs

A scheduled Claude desktop task (or any scheduler that starts an agent session in the repository's main checkout) runs this skill. Give its prompt a fail-closed preflight:

```text
Preflight, stop and report on any failure:
1. The working directory is inside <owner>/<repo>.
2. `git fetch origin main` succeeds.
3. `gh pr merge --help` is refused by the issue-lanes guard; if it prints help,
   the guard is not loaded, so stop.
Then use the `afk` skill. The owner is away: park instead of asking.
```

Approve the task's tool prompts on its first run so later runs don't stall. Runs share the owner's OS account and credentials. The guard, lane rules and branch protection bound what they can do; they are not an isolation boundary.
