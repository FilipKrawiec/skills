# AFK-ready checks

An issue may take `lane:proposed` or `lane:afk` only when every check holds or the issue records the owner's waiver. Before asking the owner, add `### Estimate` and the scope packet.

| Check | Holds when |
| --- | --- |
| Single | A story, chore or bug (not `type:epic` or `type:task`); no open PR, `state:claimed` or `state:started`. |
| Independent | No other open issue must merge in the same PR or release with it; none of its dependencies depends back on it. |
| Valuable | Merged alone, it gives a user a behaviour or the owner a named benefit; a layer that pays off only with another issue fails. |
| Small | `### Estimate` is S or M, with one sentence on the main unknown. Split an L into slices (unattended: propose the slices in the triage comment). |
| Bounded | A scope packet lists every path it may change and every issue it builds on, including ones named only in prose (see below). When the main unknown is how existing code handles real input, a run on a real sample shows the work stays inside those paths. |
| Decided | No open product, design or model question; new UI has a mockup or names an existing pattern. When the issue promises no visible change, every control a criterion moves or replaces shows where and as it does today on every layout; otherwise it is an open design question. |
| Unprivileged | Touches nothing lanes.json protects: automation, agent instructions, infrastructure, credentials, settings, releases, deploys. |

## Scope packet

````
```scope
{"paths": ["src/feature/", "tests/feature/"], "dependencies": [12]}
```
````

- A trailing `/` allows a subtree. Add the package manifest and lockfile when a criterion needs a library the project lacks.
- `lanes.py next` claims nothing without a packet; a code-changing PR without one goes to the owner to merge.

## Triage

Unattended, or for issues from `gh issue list --search "-label:lane:afk -label:lane:proposed -label:lane:owner"`:

- All checks pass → `lane:proposed`; any fails → `lane:owner`. Apply board.md's Issue form.
- Comment once: each failing check and what would fix it; end a proposal with "Apply `lane:afk` to let an AFK run take it."

## Epic design changes

When an epic gains or changes binding design (a mockup, a decision), re-run Decided on each open slice in the same session: amend its criteria, or move it to `lane:owner` with a comment so a claimed run parks. Each slice names the designs that bind it, or says none do.
