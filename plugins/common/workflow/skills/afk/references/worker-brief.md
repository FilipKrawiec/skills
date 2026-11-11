# Worker brief

Brief every worker other than the Reviewer in full, filling each field. A Craftsman gets the approved plan, not your reasoning:

```text
Intent: <issue, approved outcome and assigned phase>.
Plan: <## Plan link>; execute its steps in order, each red test first.
Criteria and scope: <acceptance, paths, exclusions, dependencies, claim>.
Checkout: <worktree, base/head SHAs, last reviewed SHA>.
Decisions and evidence: <applicable choices, prior findings, checks and captures>.
Load <skill>; do only the assigned phase. Preserve edits; do not commit, push,
dispatch, approve your own work, promote or expose credentials. Return paths,
commands/exits, red runs, exit gate and decisions in at most 8 lines.
Deliver the whole change, however many lines; return `replan` with a
proposed split only at a logical seam you found.
```
