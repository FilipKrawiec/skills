---
name: spec
description: Use when defining GitHub issues, acceptance criteria, the `lane:owner` label or other label transitions, or triaging issues into the standard form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec

Own issue semantics under a trusted direct owner request or matching approved milestone; record its source. Silence, labels and bot summaries grant no authority. Routine refinement needs no per-story approval; the owner decides epic outcomes only. Only this, `plan` and `pair` wait for the developer: clarify intent.

The `lane:owner` label (the lane label) marks an issue the owner must take part in, for a reserved decision, a credential or a device; `drive` skips it and delivers every other issue.

## 1. Define

Reuse an issue or template; read relevant code, tests, rules, ADRs and decisions. Record intent, constraints, non-goals and observable `### Acceptance criteria` (test-only work needs behavior criteria). Bound investigations by question, time and evidence. New interactions need owner prototype direction or an accepted pattern. Record product choices as [decision records](references/decision-records.md).

Reserve these for the owner, and continue independent work during the wait:

- changed strategy;
- a new paid service or a budget increase;
- a weakened authority, credential, release or quality gate.

Each open issue has:

- a native milestone;
- one type: an epic, or a story or bug under one epic (epics never nest; refinement slices are stories);
- the type rule: only a reported failing behaviour (a fault in behaviour already delivered, or a main-red failure) is a `type:bug`; a planned epic slice, a refinement slice, a split of an issue, a refactor, a perf or size budget, a design change, an audit or review follow-up and a gap an outcome review finds in a criterion are `type:story`, so a `perf`, `test`, `refactor` or `feat` titled epic child is never `type:bug` (`issue create` refuses it);
- `lane:owner` only while the owner must take part, and on an epic only while it is a draft.

Titles use `feat`, `fix`, `docs/test/ci/refactor/perf` or `epic`, then area and outcome. Group and split per [split.md](references/split.md), never by size. Only epics have children; read [epics.md](references/epics.md) before changing one. Never write a conditional criterion. Record outcome dependencies as blocked-by links, not file ordering; verify outcomes.

A filled issue body and the UI criteria rule are in [issue-example.md](references/issue-example.md).

**Exit gate:** grounded issue, authority, acceptance, dependencies and reserved decisions recorded; outsiders need `owner:approved`.

## 2. Transition

Add a fenced `scope` JSON packet (see the example; a trailing `/` covers a subtree) when the changed paths are known. The `devops` assessor judges risk from the change, with the packet's paths as evidence (`review`'s `references/risk.md`); set an issue's `risk:R*` only as the owner's floor. A follow-up to an unmerged PR joins its next round or lists it in `dependencies`. `issue create` is the only path to a new issue, never raw `gh`; `--distinct-from N --reason "..."` marks a separate one. Re-read, then replace conflicting family labels; keep others and owner holds.

The owner's session is where the owner runs `drive`.

| Actor | Transition | Condition and consequence |
| --- | --- | --- |
| Owner's session | add `lane:owner` | Owner participation required; record what agents can prepare. |
| Owner's session | remove `lane:owner` | Participation resolved and authority covers the rest; ready and unblocked goes to Todo. |
| Planner | one `type:*` | Actual outcome changes type; an epic is never claimed. |
| `drive` | add `state:started` | Exclusive assignment; In Progress. |
| `drive` | remove `state:started` | PR marked ready (Review; the open PR still excludes reassignment), or work completed, returned or reverted (record evidence or replan). |
| `drive` | one `risk:R*` on a PR | Set from the `devops` assessment when the draft opens, reason in one PR comment; reassessed when a later head touches unseen files; never below the owner's floor. |
| Reviewer | add/remove own `review:owner` | An approval with `verdict=owner` needs the owner, or that gate clears; never erase an explicit owner hold. |
| Owner's session | close a slice | Merged evidence proves its criteria; Done. |
| Owner's session | close an epic | Closed slices delivered to test cover every criterion; Done. |
| Owner's session | close a product milestone | Release evidence proves deployed acceptance; Done. |

Temporary dependency, CI, capability or owner waits keep the labels, milestone and assignment: record cause, actor, resume condition and evidence, and never overwrite active claims. With a board, status follows [board-status.md](references/board-status.md).

**Exit gate:** one type and milestone, `lane:owner` only where the owner takes part, with waits and actors explicit.

## 3. Record

Preserve template markers; link merged evidence per criterion. Withdrawn scope needs its decision; close unstarted duplicates per [split.md](references/split.md), no owner. Re-read the saved issue.

**Exit gate/output:** at most 5 lines: **Summary:** issue, criteria, labels and waits. **Decision:** next action/actor or reserved options and recommendation.
