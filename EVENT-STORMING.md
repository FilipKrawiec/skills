# Repository Release EventStorming

## Scope

The release of the repository's common and Antigravity-native plugins from a `main` commit. The goal is one compatible plugin set, identified by one annotated Git tag, produced by `scripts/release.py` and published by `.github/workflows/release.yml`.

## Timeline

1. A pull request merges into `main` with conventional commits.
2. The release workflow runs the unit tests and the plugin validator on the merge commit.
3. `release.py auto` reads the commits since the last `v*` tag (or the version in `package-metadata.json` when no tag is visible), picks the semver bump (`BREAKING CHANGE:` or `type!:` → major, `feat:` → minor, else patch), writes the version into every package's metadata, regenerates the host manifests and marketplace catalogs, commits them as `chore(release): ...` and creates the annotated tag.
4. The workflow pushes the commit and tag (`--follow-tags`) and creates the GitHub Release from the tag.

## Coverage

| Event | Trigger | Owner | Invariant-bearing decision | Reacting policy or consumer | Failure path |
| --- | --- | --- | --- | --- | --- |
| `ReleaseVerified` | Push to `main` | Release workflow | Tests and validator pass on the merge commit | Version computation | The job fails; no version changes |
| `VersionComputed` | `release.py auto` | `release.py` | One bump from the conventional commits since the last tag | Manifest sync | An unparsable history stops the script |
| `ManifestsSynchronized` | Version written | `release.py` | Every version-bearing manifest and catalog carries the one new version | Release commit | The validator rejects a drifted manifest |
| `ReleaseTagCreated` | Release commit | `release.py` | One annotated `v<semantic-version>` tag points to the release commit | Push with tags | A failed tag leaves the commit unpublished |
| `ReleasePublished` | Push succeeds | Release workflow | The GitHub Release names the tag | Plugin consumers | A failed `gh release create` fails the job; the tag is already pushed, so rerun creates the release |

## Variants

- A commit whose message starts `chore(release):` is the release commit itself and triggers no second release.
- A non-`main` push verifies only (`verify.yml`); it derives no version and creates no tag.
- A maintainer may run `just release` locally when CI is unavailable, then `git push origin main --follow-tags`; the pre-push hook runs the validator first.

## Boundaries

`release.py` owns version selection, manifest synchronization and tag creation. The release workflow owns verification, pushing and publishing. Git stores and transports commits and tags and decides nothing about release validity.

Runtime plugin compatibility gates have one narrower responsibility across every host: verify that declared companion plugins are enabled. They rely on the validated repository-wide release for compatibility and do not implement host-specific version comparison.
