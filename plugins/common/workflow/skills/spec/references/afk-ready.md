# AFK-ready checks

New readiness requires every check or a specific recorded owner waiver within owner authority; host isolation, required evidence and production controls cannot be waived by a readiness label. Failed rechecks preserve lane authorization. Before lane assignment, add `### Estimate` and the scope packet.

Keep estimates, scope, waivers and risks visible.

| Check | Holds when |
| --- | --- |
| Single | A story, chore, bug or bounded investigation (not `type:epic`); no open PR, `state:claimed` or `state:started`. |
| Independent | No other open issue must merge in the same PR or release with it; none of its dependencies depends back on it. |
| Valuable | Merged alone, it gives a user a behaviour or the owner a named benefit; a layer that pays off only with another issue fails. |
| Small | `### Estimate` is S or M, with one sentence on the main unknown. Split an L into vertical slices autonomously under approved milestone intent. |
| Bounded | A scope packet lists every path it changes and issue it builds on, including ones named only in prose, and the shared ports, libraries and widgets each criterion's outcome passes through. A bug's cause is confirmed at `file:line` by a reproducing test or traced call, never only suspected. When the main unknown is how existing code handles real input or whether it does what a criterion assumes, a real-sample run or the cited code settles it. |
| Decided | Outcomes and constraints are clear; routine technical choices remain delegated. New interactions have owner prototype direction or name an approved existing pattern. Reserved owner decisions are resolved. |
| Unprivileged | Implementation and independent review can run without production credentials. Owner-controlled actions are separated; no authority, credential, release or quality gate is weakened. CODEOWNERS review alone does not require owner delivery. |

## Scope packet

````
```scope
{"paths": ["src/feature/", "tests/feature/"], "dependencies": [12]}
```
````

- A trailing `/` allows a subtree. Add the package manifest and lockfile when a criterion needs a library the project lacks.
- `afk` claims nothing without a packet; `agent-review` hands a code-changing PR without one to the owner.

## Triage

Unattended, or for issues from `gh issue list --search "-label:lane:afk -label:lane:proposed -label:lane:owner"`:

- Ground a bug report (`type:bug`, or `<!-- explore-finding` in the body) before the checks; under a review-only request, report these edits instead of saving them:
  1. Trace the observed behaviour to the base's code and confirm its cause at `file:line`.
  2. Add only criteria restoring the report's expected behaviour, including that a test reproducing the report passes (a described render for a visual bug); propose others in the comment.
  3. Narrow the packet to the files the fix and its tests change (`alwaysInScope` paths need no entry); name the estimate's main unknown.
  4. Append `<!-- refined base=<short sha> -->` to the body whatever the outcome, closure proposals included.
- Ready under matching approved milestone, direct owner or configured reviewer authority → `lane:afk`; ready without authorization → `lane:proposed`; required owner participation → `lane:owner`. Temporary blockers preserve existing authorization and lane; record readiness separately. Absence of approval is never approval.
- Comment once: each failing check and what would fix it.

## Epic design changes

When an epic gains or changes binding design (a mockup, a decision), re-run Decided on each open slice in the same session: amend criteria within approved intent; record substantive contradictions for replanning and notify claimed runs. Preserve lane authorization through temporary blockers; use `lane:owner` only for reserved owner participation. Each slice names the designs that bind it, or says none do.
