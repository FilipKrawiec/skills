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
| Workflow | `milestone`, `spec`, `refine`, `plan`, `tdd`, `review`, `vcs`, `afk`, `agent-review`, `release`, `ship`, `health`, `improve`, `explore` |
| Authoring | `writing-great-skill` |

The Product partner, Craftsman, Reviewer and Delivery steward are responsibilities assigned by the host. They use these skills; this library does not add a separate role registry, scheduler or workflow engine.

## Load the library

Install the common packages through your host's plugin mechanism. Generated manifests are provided for the supported host formats; common skill instructions remain provider-neutral. Host discovery support does not itself prove isolated reviewer credentials, safe concurrency or production approval.

For local Claude Code development, load this checkout directly:

```bash
claude \
  --plugin-dir plugins/common/core \
  --plugin-dir plugins/common/workflow \
  --plugin-dir plugins/common/authoring
```

For Antigravity local development, explicitly link only this repository's packages:

```bash
just link-agy
```

Override `AGY_IDE_PLUGIN_DIR` to choose a destination. This command replaces symlinks and refuses existing real paths; migrate any old copied plugin directories explicitly. It does not discover/install sibling repositories or refresh other hosts. There are no automatic installation hooks. For an earlier setup pointing at this repository's removed hook directory, unset that local `core.hooksPath` after confirming it is the old setup.

## Work and verification

```bash
just unit             # focused script unit/integration fixtures
just verify           # unit tests, then one plugin validation
just sync-manifests   # regenerate host manifests from metadata
```

Use focused tests while editing and run the final gate once. `scripts/project-verify.py` remains a compatibility entrypoint; direct project build commands are the default. Model choice, scheduling, credentials, claim enforcement and native quality/deployment tools belong to the host or consuming project.

Lanes record implementation authorization, milestones group deliverable outcomes, and types classify work. Temporary waiting reasons do not erase authorization. Parallel implementation requires enforced claims and disjoint scope including tests; serialize until those capabilities are proven.

Production requires approval of the exact demonstrated artifact and configuration, with acceptance evidence, limitations and rollback readiness. This repository's stable publication remains held. Manual exact-candidate verification is available; activation still requires independently reviewed production setup and a separate change removing the literal hold. See the [production readiness record](docs/records/2026-10-18-production-promotion-readiness.md).

Each product milestone is followed by bounded engineering health: compatible current dependencies, meaningful testing gaps, test deduplication, test speed and justified refactoring. Measure confidence with reproducible project-specific mutation, coverage and risk gates; missing required evidence blocks merging. Test count and line coverage alone are insufficient.

Read [the operating model](docs/CONCEPTS.md), [the architectural baseline](docs/adr/001-provider-neutral-project-verification.md), and [contributor guidance](CONTRIBUTING.md). This is a public repository; do not add secrets, proprietary or client material.
