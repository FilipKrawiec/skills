# Repository Release EventStorming

## Scope

The release of the repository's common and Antigravity-native plugins from a `main` commit. The goal is one compatible plugin set, identified by one annotated Git tag and published through plain Git only after a local validator verifies the complete set.

## Timeline

1. A Commit Author stages a functional repository change and a shared version in every version-bearing plugin manifest on `main`.
2. `ReleaseCommitCreated` records the resulting one commit.
3. The Commit Author creates the matching annotated Release Tag.
4. The pre-push validator verifies that the tag points to `HEAD`, every manifest contains its version, and the version changed from the preceding Release Tag.
5. `push.followTags` sends the commit and tag through plain Git.

## Coverage

| Event | Trigger | Owner | Invariant-bearing decision | Reacting policy or consumer | Failure path |
| --- | --- | --- | --- | --- | --- |
| `ManifestsSynchronized` | Commit Author stages a release | Commit Author | Every version-bearing common and Antigravity manifest has exactly one new Release Version | Commit creation | Pre-push rejects incomplete synchronization |
| `ReleaseCommitCreated` | Git creates the commit | Git | The release source changes and all synchronized manifests form one commit | Tag creation | No tag is yet authoritative |
| `ReleaseTagCreated` | Commit Author creates a tag after commit | Commit Author | One annotated `v<semantic-version>` tag points to the Release Commit | Pre-push validation | `TagCreationFailed` leaves the commit unpublishable |
| `ReleasePushValidated` | Developer pushes `main` | Release Validator | The exact Release Tag points to `HEAD`, all manifests match it, and it differs from the preceding release | Remote repository and plugin consumers | `PushRejected` blocks publication |

## Variants

- A non-`main` commit does not derive a Release Version or create a Release Tag.
- A missing, conflicting, or incorrectly targeted tag makes `pre-push` fail closed.
- A bypassed local hook is outside this repository's enforcement boundary; the normal release procedure runs the validator before push.

## Boundaries

The Commit Author owns version selection, manifest synchronization, and tag creation. Release Validator owns local release checks. Git stores and transports commits and tags but does not decide release validity.

Runtime SDLC gates have one narrower responsibility across every host: verify that the declared companion plugins are enabled. They rely on the validated repository-wide release for compatibility and do not implement host-specific version comparison.
