# Epics

An epic groups vertical slices toward one owner-approved outcome and is never claimed. It carries `lane:owner` only while it waits on the owner. The body holds what native sub-issue progress cannot show.

## Body

```markdown
## Outcome
Who gets what, and why it matters now.

### Acceptance criteria
- [ ] Observable outcome, covered by at least one slice.

### Non-goals
### Decisions
- 2026-11-02: Exports stay CSV-only (owner, <comment link>).
### Open questions
- Which roles may export? Recommendation: admins only.
### Status
Waiting: #14 on the payment sandbox; next: #15.
```

## Craft

- With the owner: draft the body first. Then settle each open question one at a time, giving two to four options and a recommendation, and record each answer under Decisions while the next question waits. When no question is left, the owner's last answer approves the epic: remove `lane:owner`, slice it, and set Backlog to In progress.
- Unattended: when an outcome needs several PRs and no open epic's intent covers it, create the epic with `lane:owner`, at least one open question and the recommendation, in Backlog, and queue it with `issue queue --kind waiting --number N --text TEXT`. Never slice a draft. Work that fits an existing epic's intent becomes a slice under that epic instead.

## Slice

An approved epic with no sub-issues is served as `Work: epic #N is approved and has no sub-issues`. Create the slices as sub-issues, each with its own type, the epic's milestone, a lane, criteria and a scope packet. Together their criteria must cover every epic criterion. When the body leaves a reserved question open, put `lane:owner` back on the epic, queue it the same way and comment `<!-- epic-check stage=slice slices=C/T verdict=owner -->` with the question; C/T is closed/total sub-issues now, and the verdict holds only while both are unchanged.

## Update

Re-read the body, then edit it with `issue edit --number N --body-file PATH` only on a meaningful change:

- A binding decision or a new design: record it under Decisions. Re-run Decided on each open slice: amend criteria within approved intent, record substantive contradictions for replanning, and notify claimed runs. Each slice names the designs that bind it, or says none do.
- A scope change, a split, or a new or withdrawn slice: update Acceptance criteria so the slices still cover them.
- A wait on an owner, a dependency or a deployment: update Status.

A merged, closed or shipped slice needs no edit. Edit the body before posting any `epic-check` or `afk-wait` comment, since a later edit serves the epic again.

## Close

An epic whose sub-issues are all closed is served as `Work: epic #N has every sub-issue closed`. The epic is delivered once every epic criterion is covered by a closed slice whose closing merge is in a candidate the test environment successfully deployed. Without a configured test delivery, a closing merge on a base whose required checks are green counts.

1. Delivered: tick each criterion and link its slice, the candidate and the deployment run. Comment `## Delivered` with that list, close with `issue close --number N`, and confirm the card is in Done.
2. A criterion has no covering slice: create the missing slice under the epic.
3. The test deployment is pending: comment `<!-- afk-wait until=<UTC time one hour ahead> cause=test deployment -->`. If it failed, report that to `ship` and wait the same way.
4. A criterion needs the owner: keep the epic open, queue the question and comment `<!-- epic-check stage=close slices=C/T verdict=owner -->`.
