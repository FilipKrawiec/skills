---
name: spec
description: Use when a need or bug report should become a GitHub issue, an issue needs acceptance criteria or a lane (01 Define, 02 Spec), or issues need triage into lanes or tidying into the standard issue form.
allowed-tools: Skill Read Bash(gh:*,git:*)
---

# Spec (01 Define, 02 Spec)

**Autonomy:** use a trusted direct owner request for assigned work, or the matching approved milestone brief for delegated slices; no per-story approval. Record the source on GitHub when work must survive the session. Silence, labels and bot summaries grant no authority. Have the host invoke `milestone` separately only for missing milestone intent/approval.

- A lane says who delivers; a milestone groups a deliverable outcome. Each open non-epic issue has one lane: `lane:afk` (an agent delivers unattended), `lane:proposed` (you recommend AFK) or `lane:owner` (only the owner can: a reserved decision, credentials, settings, a device). Name milestones by release (`1.0.0`); the open one due first, else lowest, is current. Defer by milestone, never by lane.
- Apply `lane:afk` under matching milestone authority, explicit owner approval, or configured reviewer authority. Preserve authorization through temporary blockers; `lane:owner` means owner participation is required.
- Reserve product/strategy reversal, new paid services or budget increases, and weakening authority, credential, release or quality gates for the owner. Independently adjudicate other technical choices and ADRs. New interactions need owner prototype direction. Out-of-intent proposals never halt approved work.
- With a board (lanes.json `project`), move cards with `gh project item-edit`; without one, use `priority:P*` labels.

## 1. Define

Skip when the issue exists.

- Update a matching existing issue instead of opening one.
- Work that only runs tests becomes criteria of the issues it proves.
- Create from the project's template: title `<type>(<area>): <outcome>`, the current milestone unless the owner names one, priority only when the owner gave one, and one type label: `type:story` (`feat`), `type:bug` (`fix`), `type:chore` (`chore`, `docs`, `test`, `ci`, `refactor`, `perf`), `type:task` (`task`: a bounded investigation with an evidence exit) or `type:epic`.

**Exit gate:** the issue URL.

## 2. Ground

Read the code, tests, agent rules and ADRs until the open decisions are clear; cite each fact's source path, including the data a decision names (an id, a stored value), before recording it.

**Exit gate:** verified facts separated from open decisions.

## 3. Grill

- Resolve routine choices on the recommendation and record them. Use bounded investigations with a question, time limit and evidence exit. Ask reserved owner questions in ≤ 5 lines with options and a recommendation; continue independent approved work.
- Write answers into the issue: intent, non-goals, and `### Acceptance criteria` each provable by a test or a described render. ADRs only for architectural decisions.
- More than one PR: one sub-issue per vertical slice under a `type:epic`. Only epics have sub-issues, holding all their remaining work; nobody claims an epic. Slices sharing a file name the one slice owning it.

**Exit gate:** outcomes are testable; reserved decisions are resolved or visibly blocked.

## 4. Lane

Read [afk-ready.md](references/afk-ready.md) when proposing, approving or triaging an issue for AFK. Attended issues need no estimate or scope packet.

- Set the authorized ready lane; retain it across temporary readiness or dependency waits.
- Tidy (when asked): bring open issues and cards to the issue form below.
- Merged PRs already meet the criteria: comment one PR link per criterion and propose closing; the owner closes.
- With a board, move each issue now Ready (meets the issue form, no `state:` label) to Todo.

Issue form: one type label and the matching title; when open, a milestone and (epics excepted) one lane; no `state:` label when closed; `### Acceptance criteria`, plus `### Estimate` and a scope packet (a ```` ```scope ```` block of the paths the work may touch) in `lane:afk` and `lane:proposed`; slices under their epic; each dependency (packet or `### Dependencies`, including a slice's merge order) is a blocked-by link (`gh api -X POST repos/<repo>/issues/<N>/dependencies/blocked_by -F issue_id=<blocker's REST id>`) and each open link a dependency; a card with Priority P0–P2, a slice taking its epic's priority and milestone; an epic's card In progress once it has sub-issues.

Keep template fields and literal section markers. Use this body envelope: summary ≤ 3 sentences; scope, risks and decision one line each. Collapse context and evidence using `<details>` / `<summary>` with blank lines around Markdown. Omit empty sections.

````markdown
### Executive summary
Reject duplicate reservations so a slot cannot be booked twice.

**Scope:** reservation service; no API or concurrency changes.
**Risks:** concurrent requests remain a separate issue.
**Decision:** `lane:afk` under the approved milestone brief revision.

### Acceptance criteria

- [ ] A second reservation for the same slot fails without persisting.

### Estimate
S; check how existing reservations are queried.

```scope
{"paths": ["src/reservations/", "tests/reservations/"], "dependencies": []}
```

<details>
<summary>Context and evidence</summary>

`src/reservations/service.py` saves without checking occupied slots.

</details>
````

**Exit gate:** each non-epic issue has one lane, at most one new comment.

## Output

≤ 5 lines. **Summary:** one line per lane with its issues, linked. **Decision:** issues awaiting the owner's lane, with your recommendation, or "Nothing needed."
