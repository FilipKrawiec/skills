# Orchestration Contract

The caller supplies a compact stage envelope: task identity, active stage, allowed constraints and budget, selected guides and deterministic sensors, prior-result digests, recovery count, and required approval evidence. A stage skill returns either a proposed result with evidence and requested next stage, or a structured refusal: `{status: REFUSED, code, missing_or_invalid, required_stage}`.

Only `sdlc` authorizes a transition. Stage skills never authorize their own transition. Before a repository mutation, root loads the active Task from its selected State Store; after a proposed result, the State Store applies the authorized transition atomically at the expected revision. Approved REFINE appends EXECUTE while binding the approved `{story_points}` classification and, when a matching immutable policy entry exists, its resolved scorecard envelope. Read [state-store.md](state-store.md) when selecting an authority or integrating a control plane.

## Shared phase lifecycle

Root `sdlc` owns the lifecycle that applies to every phase within every stage. Stage skills define phase-specific work, but do not redefine this lifecycle.

```text
DEFINE -> EXECUTE -> VERIFY -> IMPROVE -> COMPLETE
```

## Stage mapping

| Stage | Stage skill | Stage-owned phase details | Required precondition | Authorized next step |
| --- | --- | --- | --- | --- |
| DEFINE | `sdlc-define` | Definition | Requested outcome and scope | REFINE / `sdlc-refine` |
| REFINE | `sdlc-refine` | Executable specification and approval | Definition | EXECUTE / `sdlc-execute` |
| EXECUTE | `sdlc-execute` | PLAN -> EXECUTE -> REVIEW -> SHIP | Approved specification and execution constraints | IMPROVE / `sdlc-improve` after acceptance or rejection |
| IMPROVE | `sdlc-improve` | Retrospective and derived work | Delivery outcome | Terminal `CLOSED` state or derive follow-up work |

Every implementation preserves the EXECUTE stage's PLAN-to-EXECUTE-to-REVIEW-to-SHIP order, constraints, review before shipping, evidence-based verification, digest-bound acceptance, and the rule that `sdlc-execute` uses red-green-refactor with test evidence when production behavior and tests are in scope. Run selected deterministic sensors before inferential review; record failed or skipped sensors and their risk. Corrections are bounded by the recovery count and rerun the relevant sensor. Persistence and revision control are mandatory; event topology, retries, and worker topology are adapter capabilities. A missing or stale State Store is a refusal, never permission to fall back to session-only state.

Compute a candidate digest as SHA-256 over a sorted candidate manifest of `{path, sha256}` entries. The manifest excludes `.sdlc/`, `.codex/`, and unrelated pre-existing changes; SHIP records both the manifest and its digest.

Only `sdlc` is model-discoverable. Stage skills are invoked explicitly by a caller or selected by `sdlc`; load only the active stage and relevant branch reference.
