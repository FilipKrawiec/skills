# Contributing

Keep this public library compact and portable. Put procedures in skills and use existing platform/project tools for enforcement. Add a helper only when a demonstrated boundary cannot be enforced by tools already available; do not grow a scheduler, role registry or generic contract framework here.

## Authoring

Read [writing-great-skill](plugins/common/authoring/skills/writing-great-skill/SKILL.md) before editing skills, agent rules or manifests. Name the observed failure or owner correction, place the rule with its procedure owner and delete instructions the agent would follow untold.

```text
plugins/common/<package>/skills/<skill>/
  SKILL.md          always-needed procedure
  references/       conditional branches only
  scripts/          necessary non-interactive helpers
  assets/           data/templates, not injected instructions
```

Descriptions start with “Use when” and stay within 300 characters; skill bodies within 800 words and references within 600. Use numbered phases, checkable exit gates and compact output envelopes. Another skill invokes the procedure owner; it does not link to its private files. Required worker instructions travel in the complete dispatch brief.

## Change and verify

Use an isolated worktree on a short-lived branch from the fetched base. Preserve the main checkout and unrelated work. Before editing, name the targeted test or validator; run focused checks while working. Use meaningful valid/broken behavior fixtures, not tests that freeze recipe names or workflow spelling.

```bash
just unit
just verify
just sync-manifests
```

Run `just verify` once on completed changes. CI runs the same unit fixtures and plugin validation once, checks tracked/untracked hygiene, then scans secrets. The legacy `scripts/project-verify.py` command remains compatible while its consumers migrate; it is not required for normal library development.

Every package's `package-metadata.json` owns its identity/version. `just sync-manifests` generates common host manifests and marketplace catalogs. Keep versions unified; do not hand-edit generated manifests.

Before opening a ready PR, obtain fresh independent review on both axes, fix blockers and include verdicts, commands and exit codes. Optional suggestions may remain follow-ups. Request required owner review and enable squash auto-merge bound to the reviewed head; merge approval is not production approval.

## Local installation

Use the host's direct local plugin loading or `just link-agy`. The latter uses `AGY_IDE_PLUGIN_DIR`, links only this repository's common packages, replaces existing symlinks and refuses real paths. Test installation against a temporary destination, not a user's home. No automatic refresh hooks, copies or sibling discovery run on commit/merge.

If an earlier installation configured this repository's removed hooks, first inspect `git config --local --get core.hooksPath`; when it points to the old `scripts/git-hooks`, remove that setting with `git config --local --unset core.hooksPath`. Preserve unrelated custom hooks. Explicitly migrate old copied plugin directories before linking; the command will not delete them.

## Exact-candidate release preparation

Stable publication remains disabled by the literal false condition on `promote` in `.github/workflows/release.yml`; no input or variable bypasses it. Merging changes does not publish. The manual workflow validates a full source SHA already on main and a stable tag whose version already matches every package manifest. Prepare version changes through a reviewed PR and run `just sync-manifests`; release no longer computes bumps, edits versions or pushes main.

Candidate tests run on a separate runner from trusted validation. Production-readiness checks require the existing `production` environment to list FilipKrawiec as its sole required user reviewer; missing setup cannot authorize publication. These checks do not establish credential isolation or tag protection.

Before activating promotion, follow the [production readiness record](docs/records/2026-10-18-production-promotion-readiness.md): demonstrate the exact installable candidate, independently review environment-scoped credentials and protected tags, then propose removal of the literal hold in a separate reviewed change. The owner approves the demonstrated source plus workflow configuration through the native production gate. Same-tag/source retries preserve the tag; changed content needs a fresh candidate and approval.
