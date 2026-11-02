# GitHub Safety Setup

GitHub and the host enforce authority; skill text is not a security boundary. From the installed `afk` skill directory run:

```text
node <this-skill-directory>/../../scripts/workflow.mjs safety check
```

Exit 1 reports drift. `safety apply` changes repository permissions and branch protection; run it only after an explicit owner instruction. The CLI derives repository/base from Git and Owner from CODEOWNERS. `.agents/config.json` names implementer and Reviewer; CODEOWNERS must name exactly that Reviewer on its default rule. `verify` is the default required check, with an optional override only when a repo uses another check. Project metadata is discovered from GitHub and cached locally.

## Judgment, identity and credentials

| Identity | Role | Credentials |
| --- | --- | --- |
| Owner | Admin, owner decisions | Owner-only credentials |
| Implementer | Write identity | Existing authorized mechanism; no owner/production fallback |
| Reviewer | Distinct Write identity | Existing authorized mechanism for Reviewer decisions |

Set implementer and Reviewer identities in `.agents/config.json`; configure path ownership in `.github/CODEOWNERS`. Verify Owner, Reviewer and the cached Project with `workflow.mjs cache show`. Missing identity or access is a setup gap; creating accounts or provisioning credentials needs separate owner authorization. Never give workers the owner's credentials.

Use fresh native contexts for judgment and existing authorized credentials for posting. Shared hosts do not prove secret isolation or require separate OS accounts. Keep Craftsman from reviewer authority by assignment. Verify `gh api user --jq .login` matches the Reviewer without printing tokens. Push HTTPS; production credentials stay behind native controls.

## Base protection

Each project owner configures `.github/CODEOWNERS` and branch protection or an active branch ruleset. Require code-owner review, latest-push approval, stale-review dismissal, named checks, resolved threads and linear history; disable force pushes and deletion and inspect bypasses. Configure one owner per rule: the reviewer for ordinary paths and the owner for held paths. GitHub accepts any one owner when a rule lists multiple; it does not require each. Automated review remains separate from native code-owner approval. If protection or ownership is unclear, keep merge disabled and continue preparation.

## Repository and deployment

- Squash only; allow auto-merge; delete merged head branches.
- Actions token read-only; Actions cannot approve PRs.
- No repository secrets; deployment secrets belong in protected environments.
- Production requires the owner's exact approval of test release and destination: an owner-published release on an existing `v*` test release tag, or environment approval with the owner as required reviewer. Branch/tag restrictions alone never grant production authority.
- Restrict `v*` and `rc/*` tag creation, updates and deletion to admins and the versioning automation: a dedicated app whose key lives in an environment only the base branch deploys. Never let GitHub Actions bypass: its bypass serves every workflow run, a branch's included. The test environment deploys release candidates from the base branch and test channels take `v*` test release tags. At most one app may bypass, and the ruleset has no exclusions. With `RELEASE_APP_ID` set, `check` accepts only that app and `apply` includes it when it creates the ruleset. Tag deployment policies stay within `v*` or `rc/*` (no `/` past the prefix, no `**`).

## CODEOWNERS gate

Use a global reviewer rule and owner-only rules for owner-held paths:

```text
*                    @<reviewer>
/.github/workflows/  @<owner>
```

The checker requires the global reviewer rule and one recognized owner on every rule. GitHub uses the last matching rule. The checker does not verify branch-protection effectiveness, bypasses, secret isolation or production approval; inspect those separately.

Neither engineering nor merge approval grants production permission.
