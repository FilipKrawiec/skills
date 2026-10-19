# Release on main

On 2026-10-19 the owner lifted the stable publication hold (#187, #192) and restored release-on-main as of v11.32.0: every verified push to `main` bumps from conventional commits, syncs manifests, tags and publishes.

Why: Claude Code, Codex and Antigravity install only released plugin versions, so the milestone, release, health and reworked delivery skills merged since v11.32.0 were unreachable to agents, including the Stagely Pro trial they were meant to be proved on.

The exact-candidate production gate stays the guidance `release` gives consuming projects. It was never provisioned here (no `production` environment or environment-scoped token), and a skills library whose consumers can pin a previous version does not need it. Revisit if a release ever has to be withheld after merge.
