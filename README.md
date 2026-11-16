# Portable engineering skills

A compact skill library for a team that delivers approved product outcomes through GitHub. Canonical instructions live in `plugins/common/`; host manifests are generated from package metadata.

```text
GitHub milestone approval → local implementation + independent review
             → GitHub PR → test delivery → owner demo/release approval
             → production acceptance → engineering health
```

You approve milestone direction and production candidates. The team owns refinement, routine engineering decisions and reviewed test delivery within those constraints. New interactions need lightweight prototype direction. Useful out-of-scope ideas become proposals rather than interruptions.

## Packages

| Package | Skills |
| --- | --- |
| Core | `ddd`, `hexagonal-architecture` |
| Workflow | `milestone`, `spec`, `refine`, `plan`, `tdd`, `review`, `deliver`, `release`, `health`, `improve`, `explore` |
| Authoring | `writing-great-skill` |

The Product partner, Craftsman, Reviewer and Delivery steward are responsibilities assigned by the host. They use these skills; this library does not add a separate role registry, scheduler or workflow engine.

## Load the library

Generated manifests target Claude Code and Codex plugin formats; validate loading and execution in your configured host. Common instructions are provider-neutral, but role definitions, tool permissions and hooks are host-specific. Discovery does not prove reviewer credentials, safe concurrency or production approval. Codex implementer measured, Codex Reviewer below the Opus baseline and not recommended as sole Reviewer, Codex-hosted orchestration unmeasured, AGY advisory only; see the [Codex dry run](docs/records/2026-11-14-library-host-portability.md#codex-dry-run-2026-11-16) for figures. See the [host portability audit](docs/records/2026-11-14-library-host-portability.md) for evidence and limitations.

Install released versions from the `release` branch, not `main`, which carries a fixed placeholder version:

- Claude Code: `/plugin marketplace add FilipKrawiec/skills#release`
- Codex: `codex plugin marketplace add FilipKrawiec/skills --ref release`
- Antigravity: link or clone the `release` branch (`git clone -b release https://github.com/FilipKrawiec/skills`) and run `just link-agy` there.

For local Claude Code development, load this checkout directly:

```bash
claude \
  --plugin-dir plugins/common/core \
  --plugin-dir plugins/common/workflow \
  --plugin-dir plugins/common/authoring
```

The repository includes an Antigravity workspace declaration and local linking helper. Native validation accepts the workflow skills and roles; the hook is not loaded and is not a security boundary. Antigravity supports a configured native `devops` risk session; other responsibilities stop until verified. A role/model and intact hand-back probe succeeded, but full delivery orchestration and reviewer identity remain unproven. To link and validate packages with the Antigravity CLI:

```bash
# Link live symlinks into ~/.gemini/config/plugins (dev mode)
just link-agy

# Validate plugins with Antigravity CLI
just validate-agy
```

Override `AGY_IDE_PLUGIN_DIR` to choose a destination. This command replaces symlinks and refuses existing real paths; migrate any old copied plugin directories explicitly. It does not discover/install sibling repositories or refresh other hosts. There are no automatic installation hooks. For an earlier setup pointing at this repository's removed hook directory, unset that local `core.hooksPath` after confirming it is the old setup.

## Work and verification

```bash
just unit             # focused script unit/integration fixtures
just verify           # unit tests, then one plugin validation
just sync-manifests   # regenerate host manifests from metadata
```

Use focused checks while editing and run the final gate once. `node plugins/common/workflow/scripts/workflow.mjs project status` reads the nearest `AGENTS.md`; the workflow CLI also validates manifests and creates releases without a build step. Model choice, scheduling, credentials, claims and native quality/deployment tools belong to the host or consuming project.

Lanes record implementation authorization, milestones group deliverable outcomes, and types classify work. Temporary waiting reasons do not erase authorization. Parallel implementation requires enforced claims, one run per issue; shared files never block, the later PR resolves conflicts.

Production requires approval of the exact demonstrated artifact and configuration, with acceptance evidence, limitations and rollback readiness. This plugin library itself releases on every verified push to `main`, because release consumers may require released versions; see the [release record](docs/records/2026-10-19-release-on-main.md).

Each product milestone is followed by bounded engineering health: compatible current dependencies, meaningful testing gaps, test deduplication, test speed and justified refactoring. Measure confidence with reproducible project-specific mutation, coverage and risk gates; missing required evidence blocks merging. Test count and line coverage alone are insufficient.

Read [the operating model](docs/CONCEPTS.md), [the architectural baseline](docs/adr/001-provider-neutral-project-verification.md), and [contributor guidance](CONTRIBUTING.md). This is a public repository; do not add secrets, proprietary or client material.
