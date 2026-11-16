# Risk assessment

The `devops` agent, task `risk`, assesses the diff when the draft opens. The PR's `risk:R*` label selects the implementer's model; the Reviewer runs Opus at every risk and its approval merges at every risk, so risk never asks the owner. Reserve R2 for critical changes.

## Assess

Identify a concrete plausible failure and its blast radius, recovery steps and financial impact. Weigh the behavior and callers affected, the evidence from checks, and any state, data or artifacts a revert leaves behind. Paths, CODEOWNERS, gates and repository rules are evidence, never a verdict. Touching a gate or imagining a failure alone does not make a change R2.

Classify a change lower when recovery is easy **or** the failure has no financial cost. Establish that from evidence: unknown impact is unknown, not zero cost. Seek evidence about the failure, recovery and cost before asserting an impact; report what remains unknown in the hand-back. If a critical failure could be hard to recover and costly, but neither easy recovery nor no financial cost is established, use R2 while seeking the missing evidence. Weak evidence raises risk only when the outcome it fails to observe is itself critical.

| Risk | When |
| --- | --- |
| R0 | Text only, with no behavior change. |
| R1 | Noncritical changes and critical failures with established easy recovery or no financial cost. |
| R2 | A critical failure with difficult recovery and financial cost, or unresolved recovery or cost when neither lower-risk condition is established. |

For example, a workflow defect like #516 that incorrectly asks the owner for review can be corrected and rerun without financial cost: R1. A failure that irreversibly corrupts paid customer transactions and requires costly manual restitution is R2 when evidence supports those consequences.

Risk classification does not grant authority. Follow the repository's separate owner-reserved effects and approvals regardless of risk, including credentials, authority, release controls, GitHub protections and quality gates. Do not weaken those controls.

## Hand-back

Return the concrete failure, recovery steps and financial impact, including unknowns and evidence, in the one-line reason so the reviewer can assess the classification:

```text
risk: R1
reason: a parser error stops one drive run; revert and rerun it; no financial cost evidenced by the local test workflow
```

`drive` sets the PR's label and posts the reason. The newest assessment of the diff wins; an owner-set issue `risk:R*` label is a floor. After a fix round, `drive` asks again only when the head touches files the last assessment did not see.
