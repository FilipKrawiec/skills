---
name: spec
description: Use when defining GitHub issues, acceptance criteria, authorization lanes or label transitions, or triaging issues into the standard form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec

Own issue semantics under a trusted direct owner request or matching approved milestone; record its source. Silence, labels and bot summaries grant no authority. Routine refinement needs no per-story approval.

## 1. Define

Reuse an issue or template; read relevant code, tests, rules, ADRs and decisions. Record intent, constraints, non-goals and observable `### Acceptance criteria`; test-only work needs behavior criteria. Bound investigations by question, time and evidence. New interactions need owner prototype direction or an accepted pattern. Record product choices as [decision records](references/decision-records.md). Reserve changed strategy, new paid services or budget increases, and weakened authority, credential, release or quality gates for the owner; continue independent work during a wait.

Each open issue has a native milestone, one type and one lane; an epic has none except `lane:owner` while a draft. Types are story, bug, chore, task or epic. Titles use `feat`, `fix`, `chore/docs/test/ci/refactor/perf`, `task` or `epic`, plus area and outcome. For multiple PRs, create vertical sub-issues under an epic; only epics have children and they cannot be claimed. An issue found to need several PRs is split, never sliced by `Part of` PRs; follow [split.md](references/split.md). Read [epics.md](references/epics.md) when drafting, splitting, slicing, updating or closing a `type:epic`. Record outcome dependencies as blocked-by links, not shared-file or integration ordering; verify the required outcome, not closure alone.

**Exit gate:** grounded issue, authority, acceptance, dependencies and reserved decisions recorded.

## 2. Transition

Read [afk-ready.md](references/afk-ready.md) for AFK readiness. Before AFK assignment add `### Estimate` (S/M and main unknown) and a fenced `scope` JSON packet of paths and dependencies; attended work needs neither. A follow-up to an unmerged PR lands in that PR's next round or lists the PR in `dependencies`. Before filing a `type:bug` or `type:chore`, run `issue create --check`; comment on a listed issue with the same outcome instead. Re-read before writing. Replace conflicting family labels; preserve other labels and explicit owner holds.

| Actor | Transition | Condition and consequence |
| --- | --- | --- |
| Orchestrator | `lane:proposed` | Work changes owner-requested behaviour or lacks recorded authority; request eligibility review. |
| Orchestrator | `lane:afk` | A bug restoring specified behaviour, work keeping owner-requested behaviour or direct/milestone authority; when ready and unblocked, select for Todo. |
| Backlog `refine` run | `lane:proposed` to `lane:afk` | Reviewer recorded `APPROVED AFK`; move the card to Todo. |
| Orchestrator | `lane:owner` | Owner participation required; record preparation agents can continue. |
| Orchestrator | owner lane to `lane:afk` | Participation resolved and recorded authority covers remaining work; recheck readiness. |
| Product partner | one `type:*` | Actual outcome changes type; an epic carries no work lane and cannot be claimed. |
| VCS | `state:claimed` / `state:started` | Exclusive unattended / attended assignment; In Progress. |
| VCS | remove execution label | Ready linked PR; Review, while an open PR still excludes reassignment. |
| Reviewer | add/remove own `review:owner` | Extra owner gate appears/clears; never erase an explicit owner hold. |
| Orchestrator | close routine slice | Merged evidence proves authorized criteria; Done. |
| Orchestrator | close epic | Every epic criterion covered by closed slices delivered to test; Done. |
| Orchestrator | close product milestone | Exact release evidence proves deployed acceptance; Done. |
| Ship | remove execution label | Completion or returned/reverted assignment; record evidence or replan. |

Temporary dependency, CI, capability or owner waits retain lane, milestone and assignment. Record cause, actor, resume condition and evidence; never overwrite active claims. Scope or authority changes require their own decision. With a board, use Todo for ready AFK, In Progress for active work and PR fixes, Review for a closing PR awaiting review (`Part of` stays In Progress), and Done for verified routine slices, delivered epics or accepted product milestones. Draft epics stay in Backlog; approved ones are In Progress. Without a board use priority labels; status never grants authority.

**Exit gate:** one type, milestone and lane (an approved epic none), with waits and actors explicit.

## 3. Record

Preserve template markers; write a concise summary, scope, risks, decision and acceptance with estimate/packet when applicable. Link merged evidence per criterion. Duplicate or withdrawn scope needs its applicable decision. Re-read the saved issue.

**Exit gate/output:** at most 5 lines: **Summary:** issue, criteria, lanes and waits. **Decision:** next action/actor or reserved options and recommendation.
