# GitHub Safety Setup

GitHub and the host enforce authority; skill text is not a security boundary. From the installed `afk` skill directory run:

```text
bash scripts/github-safety.sh check <owner/repo> <owner> <implementer> <reviewer> <check>...
```

In this repository the path is `plugins/common/workflow/skills/afk/scripts/github-safety.sh`. Exit 1 reports drift. Use `apply` with those arguments only under owner authorization, with owner credentials outside worker access.

## Distinct identities and isolation

| Identity | Role | Credentials |
| --- | --- | --- |
| Owner | Admin, code owner | Owner-only token |
| Implementer | Write machine user | Classic PAT: repo, project, read:org; never workflow/admin scopes |
| Reviewer | Separate Write machine user | Separate PAT: repo, project, read:org |

Set all three identities explicitly in lanes.json. Add machine users as repository collaborators and Project Write collaborators; accept invitations. Never give workers the owner's token.

Host isolates runtime stores, environment, filesystem and credential helpers so craftsman processes cannot access reviewer secrets. Selecting another account from a shared token store is not isolation. Verify this before autonomous approval. Push over HTTPS with the isolated implementer helper; SSH may use the owner's key. Verify actual identity with `gh api user --jq .login` without printing secrets.

## Base protection

Require one independent approval, approval of the latest push, CODEOWNERS review, stale-approval dismissal, named CI checks, resolved conversations and linear history. Disable force pushes and deletion. Administrators remain excluded so the owner can merge their own work. Check effective rules and bypasses separately; do not infer push restrictions from these settings alone.

## Repository and deployment

- Squash only; allow auto-merge; delete merged head branches.
- Actions token read-only; Actions cannot approve PRs.
- No repository secrets; deployment secrets belong in protected environments.
- Production requires exact owner approval of candidate and destination, enforced through environment approval or an equivalent host gate. Branch/tag restrictions alone never grant production authority.
- Restrict `v*` tag creation, updates and deletion to admins.
- Create both machine users before applying reviews/collaborators; the script skips those settings until users exist.

## Owner-only CODEOWNERS

On the base branch, include:

```text
/.github/      @<owner>
/AGENTS.md     @<owner>
/justfile      @<owner>
```

Add security rules, stored data shapes, migrations, agent instructions and release configuration. Check last-match semantics and broader rules that could override ownership.

## Checker limits

The checker inspects selected settings, identities, protection, repository secrets, environments and CODEOWNERS. It accepts custom base/tag deployment restrictions without owner review; success therefore does not prove exact production approval. It does not prove runtime isolation, enforced claims, trusted check provenance, all effective bypasses or owner-only base pushes. Verify those independently before enabling unattended authority.

An independent reviewer may approve delegated engineering at an exact head with valid checks; owner-matching changes await owner approval. Neither author approval nor merge approval grants production permission.
