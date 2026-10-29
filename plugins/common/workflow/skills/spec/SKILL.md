---
name: spec
description: Use when defining GitHub issues, acceptance criteria, authorization lanes or label transitions, or triaging issues into the standard form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec (01 Define, 02 Spec)

Own issue semantics and transitions. Act as Product partner under a trusted direct owner request or matching approved milestone revision; record its source. Silence, labels and bot summaries grant no authority. Return missing milestone direction to the orchestrator. Routine refinement needs no per-story approval.

## 1. Define and ground

Reuse an issue or create from a template. Read code, tests, rules, ADRs and decisions; cite facts and choices. Test-only work needs behavior criteria.

Each open issue has a native milestone, one type and one lane unless epic. Milestones are `v<MAJOR>` production chunks or health iterations; defer by milestone. Types: story, bug, chore, task or epic. Titles use `feat`, `fix`, `chore/docs/test/ci/refactor/perf`, `task` or `epic`, plus area and outcome. Bound tasks by question and evidence.

**Exit gate:** issue URL, verified grounding and authority source.

## 2. Refine acceptance

Record intent, constraints, non-goals and `### Acceptance criteria`, provable by tests or described render. Resolve routine choices with a recommendation. Bound investigations by question, time and evidence exit. New interactions need owner prototype direction or an accepted pattern. Return technical disagreements for adjudication.

Take product choices on their recommendation as [decision records](references/decision-records.md). Reserve changed strategy, new paid services/budget increases and authority/credential/release/quality-gate weakening for the owner. Record options and recommendation; continue independent authorized preparation.

For multiple PRs, create vertical sub-issues under `type:epic`; only epics have children and nobody claims one. Include remaining work. Slice by reusable unit tested alone; one story places units on screens. Link only dependencies where code needs code, never shared files or screens (the later PR resolves conflicts): `gh api -X POST repos/<repo>/issues/<N>/dependencies/blocked_by -F issue_id=<blocker's REST id>`. Verify the required outcome; closure alone does not prove completion.

**Exit gate:** observable outcomes, scope/dependencies and unresolved reserved questions are explicit.

## 3. Apply transitions

Read [afk-ready.md](references/afk-ready.md) when assessing AFK readiness. Add `### Estimate` (S/M and main unknown) and a fenced `scope` JSON packet with paths/dependencies before AFK assignment. Attended issues need neither.

Re-read before writing. Replace conflicting family labels; preserve others. Product partner changes `type:*`; orchestrator changes milestone, lane, wait and board state; VCS owns execution labels, Reviewer PR holds, and Ship clears stale execution labels.

| Transition / actor | Condition | Trigger |
| --- | --- | --- |
| Orchestrator → `lane:proposed` | Product partner recommends AFK; authorization absent | Request bounded authorization, no execution |
| Orchestrator → `lane:afk` | Direct/milestone authority or issue-level Reviewer `APPROVED AFK` when configured | If ready with dependencies clear, select and move to Todo |
| Orchestrator → `lane:owner` | Implementation requires owner participation; record authorized preparation | Owner decision queue; agents prepare independent work |
| Orchestrator clears owner participation → `lane:afk` | Participation resolved; recorded authority covers remaining work | Recheck readiness, then select |
| Product partner → one `type:*` | Actual outcome changes type | Recheck criteria; epics lose lanes and cannot be claimed |
| VCS → `state:claimed` / `state:started` | Exclusive unattended / attended assignment | In progress |
| VCS removes execution label | Ready linked PR | Review; open PR still excludes duplicate assignment |
| Reviewer adds/removes own `review:owner` | Extra owner gate appears/clears | Queue exact choice / resume review; never erase explicit owner hold |
| Orchestrator closes routine slice and moves to Done | Merged evidence proves authorized criteria met | Slice complete; product release remains separate |
| Orchestrator closes product-milestone issue and moves to Done | Release evidence records deployed product acceptance | Complete product milestone; merge or CI alone is insufficient |
| Ship removes execution labels | Completion or returned/reverted assignment | Record evidence or replan before reselection |

Temporary dependency, CI, capability or owner waits retain lane, milestone and assignment. Record `Waiting: <cause>; actor: <responsible>; resume condition; evidence: <link>` in the issue; clear with evidence. Replan/release idle assignments; never overwrite active claims. A lane records authorization, not readiness. Scope/authority changes need their own decision.

With a board, keep columns/membership. Orchestrator moves ready AFK issues to Todo, active work (PR fixes too) to In Progress, issues whose closing PR awaits review to Review (`Part of` stays In Progress), merged routine slices to Done after verifying criteria, and product milestones after deployed acceptance; status grants no authority. Epics with children go to In Progress. Without a board, use priority labels.

**Exit gate:** one type, native milestone, one non-epic lane; waits and transition actors explicit.

## 4. Record and return

Preserve template markers. Envelope: summary <=3 sentences; scope, risks and decision one line each; acceptance, estimate and packet as applicable.

Link merged evidence per criterion. Close product-milestone issues only after deployed acceptance. Duplicate/withdrawn scope still needs its applicable decision.

**Exit gate/output:** saved issue re-read. <=5 lines: **Summary:** linked criteria/lanes/waits. **Decision:** next action/actor, reserved options/recommendation; no unowned work.
