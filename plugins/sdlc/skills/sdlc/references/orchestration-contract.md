# Orchestration Contract

The caller supplies a compact phase envelope: task identity, current phase, allowed constraints and budget, prior-result digests, recovery count, and required approval evidence. A phase returns either a proposed result with evidence and requested next phase, or a structured refusal: `{status: REFUSED, code, missing_or_invalid, required_phase}`.

Only `sdlc` or a conforming harness authorizes a transition. Phase skills never authorize their own transition. A persistent adapter applies all fields authorized by one transition atomically; in particular, SPEC approval may persist the approved specification and execution reservation together.

| Phase | Required precondition | Authorized next step |
| --- | --- | --- |
| DEFINE | Requested outcome and scope | SPEC |
| SPEC | Approved specification | PLAN |
| PLAN | Authorized execution and constraints | EXECUTE |
| EXECUTE | Current plan | REVIEW |
| REVIEW | Execution evidence | SHIP, PLAN, or EXECUTE |
| SHIP | Successful review and candidate digest | IMPROVE after acceptance or rejection |
| IMPROVE | Delivery outcome | Close or derive follow-up work |

Every implementation preserves phase order, constraints, review before shipping, evidence-based verification, digest-bound acceptance, and the rule that `sdlc-execute` uses red-green-refactor with test evidence when production behavior and tests are in scope. Persistence, resume, concurrency, retries, and worker topology are optional capabilities; lifecycle discipline is not. A direct CLI retains the same envelope and gates in session, reports an unavailable capability instead of assuming it, and never falls back to a weaker workflow.

Compute a candidate digest as SHA-256 over a sorted candidate manifest of `{path, sha256}` entries. The manifest excludes `.sdlc/`, `.codex/`, and unrelated pre-existing changes; SHIP records both the manifest and its digest.

Only `sdlc` is model-discoverable. Phase skills are invoked explicitly by a caller or selected by `sdlc`; load only the active phase and relevant branch reference.
