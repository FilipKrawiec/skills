---
name: spec
description: Use when defining GitHub issues, acceptance criteria, authorization lanes or label transitions, or triaging issues into the standard form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec

Own issue semantics under a trusted direct owner request or matching approved milestone; record its source. Silence, labels and bot summaries grant no authority. Routine refinement needs no per-story approval. Only this and `plan` wait for the developer: clarify intent here.

## 1. Define

Reuse an issue or template; read relevant code, tests, rules, ADRs and decisions. Record intent, constraints, non-goals and observable `### Acceptance criteria`; test-only work needs behavior criteria. Bound investigations by question, time and evidence. New interactions need owner prototype direction or an accepted pattern. Record product choices as [decision records](references/decision-records.md). Reserve changed strategy, new paid services or budget increases, and weakened authority, credential, release or quality gates for the owner; continue independent work during a wait.

Each open issue has a native milestone, one type and one lane; an epic has none except `lane:owner` while a draft. Types are story, bug, chore, task or epic. Titles use `feat`, `fix`, `chore/docs/test/ci/refactor/perf`, `task` or `epic`, plus area and outcome. One logical change is one issue and one PR, however many lines, while an agent can deliver it in one go. Split only at a logical seam, never by size, estimate or layer, into sub-issues under an epic, never `Part of` PRs; follow [split.md](references/split.md). Only epics have children and they cannot be claimed. Read [epics.md](references/epics.md) when drafting, splitting, slicing, updating or closing a `type:epic`. Each slice ends where a user observes it: a slice building a reusable unit also places it where its criteria name. Never write a conditional criterion ("mounts it if #N is merged"). Record outcome dependencies as blocked-by links, not shared-file ordering; verify the outcome, not closure.

**Exit gate:** grounded issue, authority, acceptance, dependencies and reserved decisions recorded.

## 2. Transition

Read [afk-ready.md](references/afk-ready.md) for AFK readiness. Before AFK assignment add `### Estimate` (its main unknown) and a fenced `scope` JSON packet of paths and dependencies; attended work needs neither. A follow-up to an unmerged PR lands in that PR's next round or lists the PR in `dependencies`. Before filing a `type:bug` or `type:chore`, run `issue create --check`; comment on a listed issue with the same outcome instead. Re-read before writing. Replace conflicting family labels; preserve others and owner holds.

| Actor | Transition | Condition and consequence |
| --- | --- | --- |
| Orchestrator | `lane:proposed` | Work changes owner-requested behaviour or lacks recorded authority; request eligibility review. |
| Orchestrator | `lane:afk` | A bug restoring specified behaviour, work keeping owner-requested behaviour, or direct/milestone authority; ready and unblocked goes to Todo. |
| Backlog `refine` run | `lane:proposed` to `lane:afk` | Reviewer recorded `APPROVED AFK`; move the card to Todo. |
| Orchestrator | `lane:owner` | Owner participation required; record what agents can prepare. |
| Orchestrator | owner lane to `lane:afk` | Participation resolved and authority covers the rest; recheck readiness. |
| Product partner | one `type:*` | Actual outcome changes type; an epic has no work lane. |
| VCS | `state:claimed` / `state:started` | Exclusive unattended / attended assignment; In Progress. |
| Ship | remove execution label | PR marked ready; Review, the open PR still excludes reassignment. |
| Risk subagent | one `risk:R*` on a PR | Set once the draft opens; `ship` raises, never lowers. |
| Reviewer | `lane:afk` to `lane:owner`, PR `risk:R2` | Author review capped; PR stays draft. |
| Reviewer | add/remove own `review:owner` | Extra owner gate appears/clears; never erase an explicit owner hold. |
| Orchestrator | close routine slice | Merged evidence proves authorized criteria; Done. |
| Orchestrator | close epic | Closed slices delivered to test cover every criterion; Done. |
| Orchestrator | close product milestone | Exact release evidence proves deployed acceptance; Done. |
| Ship | remove execution label | Completed, returned or reverted; record evidence or replan. |

Temporary dependency, CI, capability or owner waits retain lane, milestone and assignment. Record cause, actor, resume condition and evidence; never overwrite active claims. Scope or authority changes need their own decision. With a board: Todo for ready AFK, In Progress for active work and draft PRs, Review once its PR is ready (`Part of` until deployed acceptance), Done for verified slices, delivered epics or accepted milestones. Draft epics stay in Backlog; approved ones are In Progress. Without a board use priority labels; status never grants authority.

**Exit gate:** one type, milestone and lane (an approved epic none), with waits and actors explicit.

## 3. Record

Preserve template markers; write summary, scope, risks, decision and acceptance, with estimate/packet when applicable. Link merged evidence per criterion. Duplicate or withdrawn scope needs its decision. Re-read the saved issue.

**Exit gate/output:** at most 5 lines: **Summary:** issue, criteria, lanes and waits. **Decision:** next action/actor or reserved options and recommendation.
