# GitHub Safety Setup

GitHub and the host enforce authority; skill text is not a security boundary. From the installed `afk` skill directory run:

```text
bash scripts/github-safety.sh check <owner/repo> <owner> <implementer> <reviewer> <check>...
```

In this repository the path is `plugins/common/workflow/skills/afk/scripts/github-safety.sh`. Exit 1 reports drift. Use `apply` with those arguments only under owner authorization, with owner credentials outside worker access.

## Judgment, identity and credentials

| Identity | Role | Credentials |
| --- | --- | --- |
| Owner | Admin, owner decisions | Owner-only credentials |
| Implementer | Write identity | Existing authorized mechanism; no owner/production fallback |
| Reviewer | Distinct Write identity | Existing authorized mechanism for Reviewer decisions |

Set all three identities explicitly in lanes.json. Verify configured collaborator and Project access. Missing identity or access is a setup gap; creating accounts or provisioning credentials needs separate owner authorization. Never give workers the owner's credentials.

Use fresh native contexts for judgment and existing authorized credentials for posting. Shared hosts do not prove secret isolation or require separate OS accounts. Keep Craftsman from reviewer authority by assignment. Verify `gh api user --jq .login` matches the Reviewer without printing tokens. Push HTTPS; production credentials stay behind native controls.

## Base protection

Each project owner configures its own `.github/CODEOWNERS` and branch protection; this library installs no shared rule. Require latest-push approval, CODEOWNERS review, stale-review dismissal, named checks, resolved threads and linear history; disable force pushes/deletion and inspect bypasses. Make the configured Reviewer sole matching CODEOWNER on every reviewable path; approval count alone cannot pin identity and multiple owners are alternatives. `agent-review` separately holds owner decisions. If a changed path lacks native Reviewer enforcement, name the path/rule gap, keep merge disabled and continue independent preparation. Never substitute procedural approval or start infrastructure.

## Repository and deployment

- Squash only; allow auto-merge; delete merged head branches.
- Actions token read-only; Actions cannot approve PRs.
- No repository secrets; deployment secrets belong in protected environments.
- Production requires the owner's exact approval of test release and destination: an owner-published release on an existing `v*` test release tag, or environment approval with the owner as required reviewer. Branch/tag restrictions alone never grant production authority.
- Restrict `v*` and `rc/*` tag creation, updates and deletion to admins and the versioning automation: a dedicated app whose key lives in an environment only the base branch deploys. Never let GitHub Actions bypass: its bypass serves every workflow run, a branch's included. The test environment deploys release candidates from the base branch and test channels take `v*` test release tags. Exactly one app may bypass, with no exclusions; with `RELEASE_APP_ID` set, `apply` adds that app and `check` accepts only it. Tag deployment policies name exactly `v*` or `rc/*`.

## Reviewer CODEOWNERS gate

On the base branch, include a global Reviewer rule. Keep that same sole owner on every narrower rule:

```text
*              @<reviewer>
/.github/      @<reviewer>
```

The checker rejects any rule with another or additional owner. Put owner-reserved work in configured `ownerPaths`; never list the owner as an alternative CODEOWNER when Reviewer approval must be mandatory.

## Checker limits

The checker requires a global Reviewer rule and rejects every CODEOWNERS rule that names another or additional owner. This makes the Reviewer the sole owner for every path under GitHub's last-match semantics. It does not verify branch-protection effectiveness, every bypass, secret isolation or exact production approval; inspect those separately. The checker is not the merge gate.

Neither engineering nor merge approval grants production permission.
