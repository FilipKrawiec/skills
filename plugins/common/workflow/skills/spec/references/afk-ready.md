# AFK-ready checks

New readiness requires every check or a recorded owner waiver; independent review, evidence and production controls cannot be waived by a readiness label. Failed rechecks preserve lane. Before lane assignment, add `### Estimate` and the scope packet.

| Check | Holds when |
| --- | --- |
| Single | A story, chore, bug or bounded investigation (not `type:epic`); no open PR, `state:claimed` or `state:started`. |
| Independent | No other open issue must merge with it; dependencies do not depend back on it. |
| Valuable | Merged alone, it gives a user behaviour or the owner a named benefit. |
| Small | Estimate is S (up to about 5 changed files) or M (up to about 20), with its main unknown. A diff past twice its estimate splits before review. Split L work into vertical slices under approved milestone intent. Size guides slicing, never authority. |
| Bounded | The packet lists changed paths and dependencies. For each criterion, trace the call path from the code that observes the effect to the code that causes it, and put every file on that path, shared components included, in the packet. Confirm bug causes at `file:line` with a reproducing test or traced call. Resolve input or code uncertainties with a real sample or inspection. |
| Decided | Outcomes and constraints are clear; routine choices remain delegated. New interactions follow owner prototype direction or an approved pattern. Resolve reserved decisions. |
| Unprivileged | Implementation and review need no production credentials. Separate owner actions; do not weaken authority, credentials, release or quality gates. CODEOWNERS review alone does not require owner delivery. |

## Scope packet

````
```scope
{"paths": ["src/feature/", "tests/feature/"], "dependencies": [12]}
```
````

- `dependencies` lists issue or PR numbers (`12` or `"#12"`); `afk` skips an issue that depends on an open PR until it merges, and `afk check` reports it as blocked. A PR closed unmerged no longer blocks; drop or replace that dependency.
- `afk` also holds an issue whose `paths` cover a file changed by an open PR that does not deliver it, and `afk check` names it `Held: #N overlaps open PR #M` until that PR merges or closes.
- A trailing `/` allows a subtree. Include package and lock files when adding a needed library.
- `afk` implements only issues with packets; it serves a packet-less `lane:afk` Todo issue as a refine unit, even while blocked. Owner participation is for reserved effects.

## Triage

Unattended, or for issues from `gh issue list --search "-label:lane:afk -label:lane:proposed -label:lane:owner"`:

- Ground a bug report (`type:bug`, or `<!-- explore-finding` in the body) before the checks; under a review-only request, report these edits instead of saving them:
  1. Trace the observed behaviour to the base's code and confirm its cause at `file:line`.
  2. Add only criteria restoring the report's expected behaviour, including that a test reproducing the report passes (a described render for a visual bug); propose others in the comment.
  3. Narrow the packet to every file the fix and its tests may change; name the estimate's main unknown.
  4. Append `<!-- refined base=<short sha> -->` to the body whatever the outcome, closure proposals included.
- Nature determines lane: owner-held decisions, credentials, devices or reserved effects → `lane:owner`; otherwise a `type:bug` restoring specified behaviour, work keeping owner-requested behaviour, or work under approved milestone or direct owner authority → `lane:afk`; otherwise → `lane:proposed`, for automated Reviewer eligibility. Size never determines lane. Temporary blockers preserve lane; record readiness separately. No approval is not approval.
- Comment once: each failing check and what would fix it.
