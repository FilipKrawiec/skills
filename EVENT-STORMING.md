# Repository Release EventStorming

## Scope

The release of the repository's common plugins from a `main` commit. The goal is one compatible plugin set, identified by one annotated Git tag, cut by the owner with `just release` (`scripts/release.py`) and published by `.github/workflows/release.yml`.

## Timeline

1. Pull requests merge into `main` with conventional commits, each after an approved review.
2. The owner runs `just release` (or `just release minor|patch|major`) in a local checkout. The recipe first runs `just verify`: the unit tests and the plugin validator.
3. `release.py` fetches `origin` and refuses unless the checkout is on `main`, clean, and level with `origin/main`.
4. `release.py` reads the commits since the last `v*` tag (or the version in `package-metadata.json` when no tag is visible), picks the semver bump (`BREAKING CHANGE:` or `type!:` → major, `feat:` → minor, else patch), writes the version into every package's metadata, regenerates the host manifests and marketplace catalogs, commits them as `chore(release): ...`, creates the annotated tag, refreshes the locally installed plugins and validates the release version.
5. The recipe pushes the commit and the tag in one atomic push (`git push --atomic origin HEAD:main refs/tags/v<version>`), as admin past branch protection.
6. The tag push starts the release workflow, which creates the GitHub Release from the tag.

## Coverage

| Event | Trigger | Owner | Invariant-bearing decision | Reacting policy or consumer | Failure path |
| --- | --- | --- | --- | --- | --- |
| `ReleaseVerified` | `just release` | Owner's `just verify` | Tests and validator pass on the commit to be released | Release base check | The recipe stops; no version changes |
| `ReleaseBaseConfirmed` | Verification passes | `release.py` | The checkout is a clean `main` level with a freshly fetched `origin/main` | Version computation | `release.py` refuses before writing anything |
| `VersionComputed` | Base confirmed | `release.py` | One bump from the conventional commits since the last tag | Manifest sync | An unparsable history stops the script |
| `ManifestsSynchronized` | Version written | `release.py` | Every version-bearing manifest and catalog carries the one new version | Release commit | The validator rejects a drifted manifest |
| `ReleaseTagCreated` | Release commit | `release.py` | One annotated `v<semantic-version>` tag points to the release commit | Atomic push | A failed tag leaves the commit local and unpublished |
| `ReleasePushed` | Tag created | `just release` | `main` and the tag reach `origin` together or not at all | Release workflow | A rejected push leaves both local; reset them before rerunning |
| `ReleasePublished` | Tag push | Release workflow | The GitHub Release names the tag | Plugin consumers | A failed `gh release create` fails the job; the tag is already pushed, so rerun creates the release |

## Variants

- A push to any branch, or a pull request, verifies only (`verify.yml`); it derives no version and creates no tag.
- `release.py --dry-run` previews the next version from any checkout without the base check and changes nothing.

## Boundaries

The owner alone releases: `main` takes changes only through approved pull requests and only admins may create `v*` tags. `just release` owns verification and the atomic push. `release.py` owns the base check, version selection, manifest synchronization and tag creation. The release workflow only publishes. Git stores and transports commits and tags and decides nothing about release validity.

Runtime plugin compatibility gates have one narrower responsibility across every host: verify that declared companion plugins are enabled. They rely on the validated repository-wide release for compatibility and do not implement host-specific version comparison.
