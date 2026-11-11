# Epics

An epic groups logical changes, each useful alone, toward one owner-approved outcome and is never claimed. It carries `lane:owner` only while it waits on the owner. The body holds what native sub-issue progress cannot show.

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
- Unattended: when an outcome needs several PRs and no held issue or open epic authorizes it, create the epic with `lane:owner`, at least one open question and the recommendation, in Backlog, and queue it with `issue queue --kind waiting --number N --text TEXT`. Never slice a draft. Work that fits an existing epic's intent becomes a slice under that epic instead.

## Slice

An approved epic with no sub-issues is served as `Work: epic #N is in Todo: slice it if it has no sub-issues, otherwise verify its delivery and close it`. Create one sub-issue per logical change, never per layer, each with a type, the epic's milestone, a lane, criteria and a scope packet. Their criteria together cover every epic criterion; leave the card In progress. When the body leaves a reserved question open, put `lane:owner` back on the epic, queue it the same way and comment the question.

## Update

Re-read the body; edit it with `issue edit --number N --body-file PATH` only on a meaningful change:

- A binding decision or a new design: record it under Decisions. Re-run Decided on each open slice: amend criteria within approved intent, record substantive contradictions for replanning, and notify claimed runs. Each slice names the designs that bind it, or says none do.
- A scope change, a split, or a new or withdrawn slice: update Acceptance criteria so the slices still cover them.
- A wait on an owner or a dependency: update Status.

A merged or closed slice needs no edit. An unchanged epic is served again only after its body, labels, slice counts or outside comments change.

## Close

An epic whose sub-issues are all closed is served with the same `Work:` line. The epic is delivered once every epic criterion is covered by a closed slice whose closing merge is in a candidate the test environment successfully deployed. Without a configured test delivery, a closing merge on a base with green required checks counts.

1. Delivered: tick each criterion and link its slice, the candidate and the deployment run. Comment `## Delivered` with that list, close with `issue close --number N`, and confirm the card is in Done.
2. No slice covers a criterion, or the base, beside its binding design, lacks it: create the missing slice.
3. The test deployment is pending: comment the wait without editing the body (an edit serves it again); the CLI serves it after the next base merge. If it failed, tell the owner and wait the same way.
4. A criterion needs the owner: keep the epic open, put `lane:owner` back on it, queue the question and comment it.
