# Orchestration Contract

The caller supplies a compact stage envelope: task identity, active stage, allowed constraints and budget, selected guides and deterministic sensors, prior-result digests, recovery count, and required approval evidence. A stage skill returns either a proposed result with evidence and requested next stage, or a structured refusal: `{status: REFUSED, code, missing_or_invalid, required_stage}`.

Only `sdlc` or a conforming harness authorizes a transition. Stage skills never authorize their own transition. A persistent adapter applies all fields authorized by one transition atomically; in particular, approved REFINE appends EXECUTE while binding the approved `{story_points}` classification and, when a matching immutable policy entry exists, its resolved scorecard envelope.

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

Every implementation preserves the EXECUTE stage's PLAN-to-EXECUTE-to-REVIEW-to-SHIP order, constraints, review before shipping, evidence-based verification, digest-bound acceptance, and the rule that `sdlc-execute` uses red-green-refactor with test evidence when production behavior and tests are in scope. Run selected deterministic sensors before inferential review; record failed or skipped sensors and their risk. Corrections are bounded by the recovery count and rerun the relevant sensor. Persistence, resume, concurrency, retries, and worker topology are optional capabilities; lifecycle discipline is not. A direct CLI retains the same envelope and gates in session, reports an unavailable capability instead of assuming it, and never falls back to a weaker workflow.

Compute a candidate digest as SHA-256 over a sorted candidate manifest of `{path, sha256}` entries. The manifest excludes `.sdlc/`, `.codex/`, and unrelated pre-existing changes; SHIP records both the manifest and its digest.

Only `sdlc` is model-discoverable. Stage skills are invoked explicitly by a caller or selected by `sdlc`; load only the active stage and relevant branch reference.
