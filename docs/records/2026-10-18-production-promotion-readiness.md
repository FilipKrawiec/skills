# Production promotion readiness

This records the repository-specific setup still required for #191. The release workflow prepares an exact, already-versioned candidate. Its promotion job remains disabled by a literal false condition; dispatching, passing verification or approving a PR cannot publish through it.

## Candidate demo

Prepare version changes through an ordinary reviewed PR and regenerate manifests with `just sync-manifests`. Record the merged full source SHA, proposed stable tag and release workflow revision. Install that exact tree in the test host, walk through acceptance scenarios, and record limitations and feedback classification in the release issue. A passing script is not an installable-candidate demonstration.

The native run identifies the source and workflow revision. Candidate tests execute on a separate runner from trusted validation and output binding. Local Git/API fixtures exercise release mechanics; they do not establish GitHub credential isolation, environment protection or protected tags.

## Owner-controlled activation

Before proposing removal of the literal publication hold, obtain independent review of these concrete settings and evidence:

- An existing `production` environment requires FilipKrawiec as its sole user reviewer. Read-only API inspection must succeed; absence, additional alternative reviewers or unreadable proof blocks promotion.
- The production credential is stored only as the environment secret `PRODUCTION_RELEASE_TOKEN`, with no reusable copy available to implementer/reviewer hosts. Document its limited repository authority and the owner-controlled identity that can use it.
- Tag policy protects the stable version namespace against replacement/deletion and limits creation to the intended promotion authority. Demonstrate a denied implementer attempt using a disposable protected test tag, without modifying any released tag.
- Confirm environment approval is pending before the production credential can be accessed. Record the approver, exact candidate SHA, tag and workflow revision. Changed source or configuration requires a fresh approval.

Provisioning those authority/credential controls is a separate owner decision. An environment-secret name, a token's nonempty value, a shared account selector, or a local passing test proves none of them. Keep the literal hold when proof is missing. Remove it only in a separately reviewed change containing the setup evidence; do not add a variable or dispatch bypass.

## Acceptance and recovery

The first live promotion needs a prepared demo and explicit production approval. Afterwards verify the immutable tag points at the approved commit, inspect published metadata and perform the host installation acceptance checks. Record commands, run URLs and outcomes rather than inferring success from merge/CI.

A retry may create a missing release for the same tag and source; it must never move an existing tag. A failed or defective publication does not authorize deleting tags, changing a released artifact or silently replacing its contents. Prefer the previously accepted pinned version while a corrected candidate is prepared; destructive changes need their own authority. No automatic production rollback mechanism has been demonstrated by these local fixtures.
