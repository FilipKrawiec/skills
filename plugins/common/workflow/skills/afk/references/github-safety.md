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

Use a fresh native Reviewer context for judgment and verify `gh api user --jq .login` matches the configured Reviewer before posting. Shared-host subagents provide separate judgment contexts, not proof of secret isolation; keep Craftsman from Reviewer authority by assignment. Do not assume separate containers, OS accounts or machines. Push only through an authorized identity; production credentials remain behind native controls.

## Base protection

Each repository owner configures its own `.github/CODEOWNERS` and branch protection. Require latest-push approval, code-owner review, stale-review dismissal, named CI checks, resolved conversations and linear history. The configured Reviewer must be the sole owner in every CODEOWNERS rule; approval count alone cannot pin identity, and listed owners are alternatives. Keep owner decisions in `ownerPaths` and `agent-review` holds. Disable force pushes and deletion; inspect effective rules and bypasses separately.

## Repository and deployment

- Squash only; allow auto-merge; delete merged head branches.
- Actions token read-only; Actions cannot approve PRs.
- No repository secrets; deployment secrets belong in protected environments.
- Production requires exact owner approval of candidate and destination, enforced through environment approval or an equivalent host gate. Branch/tag restrictions alone never grant production authority.
- Restrict `v*` tag creation, updates and deletion to admins.
- Create both machine users before applying reviews/collaborators; the script skips those settings until users exist.

## Reviewer CODEOWNERS gate

On the base branch, include a global Reviewer rule. Any narrower rule must keep that same sole owner:

```text
*              @<reviewer>
/.github/      @<reviewer>
```

The checker rejects any later rule with a different or additional owner. Put owner-reserved work in configured `ownerPaths`; never list the owner as an alternative code owner when Reviewer approval must be mandatory.

## Checker limits

The checker inspects selected settings, identities, protection, repository secrets, environments and all CODEOWNERS rules. Success does not prove exact production approval, runtime isolation, trusted check provenance, every effective bypass or owner-only base pushes. Verify those independently before enabling unattended authority.

Reviewer approval is the merge gate for every PR; an owner hold adds a separate required decision. Neither author approval nor merge approval grants production permission.
