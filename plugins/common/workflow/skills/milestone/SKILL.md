---
name: milestone
description: Use when an owner wants to approve a product milestone and delegate its implementation through acceptance and the next ranked proposal.
allowed-tools: Read Edit Bash
---

# Milestone

## 1. Agree the direction

Record the owner brief: outcome, constraints, non-goals, acceptance criteria, confidence gates, and bounded slices. For new interactions, show a working prototype and obtain owner direction; for an established interaction, identify the existing pattern to reuse. Resolve material ambiguity before implementation. Bind approval to the exact brief and prototype revision; prior enthusiasm or approval of another revision is insufficient.

**Exit gate:** trusted owner approval names the exact revision and interaction direction or existing pattern.

## 2. Deliver autonomous slices

Within that approval, choose routine implementation details, implement and verify each bounded slice, and continue without asking for routine permission. Replan material contradictions. Owner approval is needed for changed product intent, interaction direction, strategy, new paid services, budget increases or protected authority; independent technical review decides other engineering/ADR changes. Continue unaffected approved slices.

Have the host dispatch leaf assignments for planning, implementation, independent review and delivery. Only the orchestrator dispatches workers and advances phases. Workers load their assigned skill, return its result and never redispatch or run the next phase; keep invocation depth at most two and avoid cycles. Each assignment includes the approved revision, acceptance, owned paths, preserved concurrent edits, commands and confidence gates, dependencies, stop conditions and required output. Reviewers get a fresh context and read-only evidence, no implementation or production credentials; implementers cannot approve their own work or access promotion credentials. Release credentials belong only to the configured promotion control.

Use this complete dispatch brief, filling every field:

```text
Implement slice: save the approved filter selection.
Approval: owner brief revision b17; prototype p4.
Acceptance: saved selection survives reload; existing defaults still work.
Own: filter model and its tests; preserve every other edit.
Dependencies: existing storage port; no new interaction or paid service.
Verify: run the project's filter tests and configured confidence gates;
report exact commands, exits, artifact revision and missing evidence.
Stop: material contradiction, changed direction/cost, unavailable evidence.
Do not redispatch, promote, or access production credentials.
Return: Summary with paths/evidence; Decision with blocker or Nothing needed;
at most eight lines. Reviewer separately checks behavior and risk read-only.
```

The host replaces example commands and paths with concrete project values before dispatch. Keep required worker behavior in the owning skill or the complete brief; pointers alone do not transfer instructions.

**Exit gate:** every accepted slice has passing evidence and independent review; unresolved blockers remain explicit.

## 3. Hand off the result

Have the host dispatch release with the exact candidate and approval evidence, then bounded health after production acceptance. Automatically deliver the working test candidate for owner evaluation; production still needs exact owner approval. Rank the next milestone proposals by user value, risk and dependency, recommend one, and include any health prerequisite. Do not treat the next proposal as approved.

**Exit gate:** test delivery and limitations recorded, health scheduled after production acceptance or completed, next proposal ranked.

## Output

Use **Summary** for approved revision, delivered evidence and ranked next proposal; **Decision** for the exact owner choice, recommended option, or “Nothing needed.” Session replies ≤5 lines; run reports ≤8. Record commands and exit codes in reports.
