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

Run `just verify` once on completed changes. CI runs the same unit fixtures and plugin validation once, checks tracked/untracked hygiene, then scans secrets. Use `node plugins/common/workflow/scripts/workflow.mjs project status` to inspect the nearest `AGENTS.md` when needed.

The workflow CLI entry `plugins/common/workflow/scripts/workflow.mjs` only parses commands and takes locks. Its modules in `scripts/lib/` import downward only: `core` (process, Git, config, GitHub metadata, flags, the implementer check) ← `board` (scope packets, PR records, Reviewer approval, board status) ← `pr` ← `state` ← `drive`; `issues` builds on `board`, `vcs` (commit, push, review context) on `issues`, and `worktrees` on `core`. Tests import each name on its own line from the module that defines it.

Every package's `package-metadata.json` owns its identity/version. `just sync-manifests` generates common host manifests and marketplace catalogs. Keep versions unified; do not hand-edit generated manifests.

Deliver through `drive <issue>` as the `deliver` skill describes: it opens the draft PR, one reviewer runs `review` in one pass, the implementer fixes Blocker and Important findings, and `drive` marks the PR ready and turns on squash auto-merge. Optional suggestions may remain follow-ups; merge approval is not production approval.

## Local installation

Use the host's direct local plugin loading or `just link-agy`; linking does not establish that a host loads or executes every component. Run `just validate-agy` and inspect `agy plugin list --json` and `agy agent` after installation. The workflow hook does not load in Antigravity; never treat it as a security boundary. Antigravity supports a configured native `devops` risk session and a separate `reviewer` session; other responsibilities stop until verified. The AGY reviewer has no shell tool, so it cannot claim or post: `review-session` holds the exact-head claim and starts `agy-review.mjs`, which gathers the review context and diff, asks AGY for one strictly validated JSON verdict, and posts it through `review-post` as the existing reviewer identity. It needs an installed `reviewer` agent and model (`agy agents`, `agy models`). AGY sees no credential. A `review` or `approve` step posts `APPROVE` only for an AGY-authored `ready` verdict (an `approve` step also needs a ready PR) with green CI and complete context (`verdict=owner` on owner-reserved PRs), while `fixes`, `split` and malformed output never approve. A missing role or model, denied permission, malformed or off-head verdict, or oversized diff posts nothing and releases the claim. Native end-to-end review of a real draft PR is unproven here: verify it before relying on it. See the [host portability audit](docs/records/2026-11-14-library-host-portability.md) for earlier evidence. The latter uses `AGY_IDE_PLUGIN_DIR`, links only this repository's common packages, replaces existing symlinks and refuses real paths. Test installation against a temporary destination, not a user's home. No automatic refresh hooks, copies or sibling discovery run on commit/merge.

If an earlier installation configured this repository's removed hooks, first inspect `git config --local --get core.hooksPath`; when it points to the old `scripts/git-hooks`, remove that setting with `git config --local --unset core.hooksPath`. Preserve unrelated custom hooks. Explicitly migrate old copied plugin directories before linking; the command will not delete them.

## Releases

Every verified push to `main` is released: `.github/workflows/release.yml` runs `node plugins/common/workflow/scripts/workflow.mjs release`, which picks the bump from the conventional commits since the last `v*` tag (`type!:` or `BREAKING CHANGE:` major, `feat:` minor, else patch), syncs every manifest, commits them on top of that `main` commit to the `release` branch and tags that commit, then pushes the branch and tag atomically with `RELEASE_TOKEN` and publishes the GitHub Release. Nothing is pushed to `main`, so `main` keeps a fixed version and a release never puts open PRs behind; `release` is always the latest `main` commit plus one manifest-only commit. The owner's skills-main refresh on the Mac tracks `origin/release` (`git fetch origin release`, then reset the refreshed checkout to `origin/release`). Commit types decide the version, so title PRs accordingly. Preview with `node plugins/common/workflow/scripts/workflow.mjs release --dry-run`.
