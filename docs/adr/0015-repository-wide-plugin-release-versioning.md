# ADR-0015: Repository-Wide Plugin Release Versioning

## Decision

All common and Antigravity-native plugins share one semantic Release Version. The authoritative persistent record is an annotated Git tag named `v<semantic-version>` on a `main` commit; this repository does not use a root version file.

The agent chooses the release version and synchronizes every version-bearing plugin manifest in the one functional `main` commit. After committing and before pushing, the agent creates the matching annotated tag. The pre-push validator verifies that the tag points to `HEAD`, every version-bearing manifest matches the tag, and the version differs from the preceding Release Tag. Local setup enables `push.followTags` so normal pushes include the tag. The validator does not infer or validate major/minor/patch from Conventional Commit type.

This is a plain-Git release process: there is no CI, GitHub Release, registry, root version file, or separate release commit. The first repository-wide release is `v8.3.0`.

Runtime SDLC gates verify enabled companion plugins only. Version compatibility is a release-time invariant, avoiding different runtime version-detection mechanisms for different agents.

## Context

SDLC depends on Core, Workflow, and Authoring as one compatible set. Independent package versions make an enabled dependency insufficient evidence of compatibility. The repository already requires version fields in host plugin manifests, so source must be synchronized with the released tag while retaining one user-facing feature commit.

## Consequences

- Any functional plugin change on `main` creates one repository-wide release version.
- A failed local tag operation leaves the commit unpublishable; pre-push validation reports the failure.
- The validation hook is a local workflow guard; it is not a server-side enforcement boundary.
- The former package-specific release script and its independent-version contract must be replaced.
