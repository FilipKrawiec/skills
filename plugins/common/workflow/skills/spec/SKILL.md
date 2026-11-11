---
name: spec
description: Use when defining GitHub issues, acceptance criteria, authorization lanes or label transitions, or triaging issues into the standard form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec

Own issue semantics under a trusted direct owner request or matching approved milestone; record its source. Silence, labels and bot summaries grant no authority. Routine refinement needs no per-story approval. Only this and `plan` wait for the developer: clarify intent here.

## 1. Define

Reuse an issue or template; read relevant code, tests, rules, ADRs and decisions. Record intent, constraints, non-goals and observable `### Acceptance criteria`; test-only work needs behavior criteria. Bound investigations by question, time and evidence. New interactions need owner prototype direction or an accepted pattern. Record product choices as [decision records](references/decision-records.md). Reserve changed strategy, new paid services or budget increases, and weakened authority, credential, release or quality gates for the owner; continue independent work during a wait.

Each open issue has a native milestone and one type; it carries `lane:owner` only while the owner must take part, and an epic only while a draft. Types are story, bug, chore, task or epic. Titles use `feat`, `fix`, `chore/docs/test/ci/refactor/perf`, `task` or `epic`, plus area and outcome. One logical change is one issue and one PR, however large, while an agent delivers it in one go; one it cannot splits only at a logical seam, never by size, estimate or layer, into sub-issues of an epic, not `Part of` PRs; follow [split.md](references/split.md). Only epics, never started, have children. Read [epics.md](references/epics.md) when drafting, slicing, updating or closing a `type:epic`. Each slice ends where a user observes it: a slice building a unit also places it where its criteria name, unless it is a separate reusable component its own tests observe. Never write a conditional criterion ("mounts it if #N is merged"). Record outcome dependencies as blocked-by links, not file ordering; verify outcomes, not closure.

**Exit gate:** grounded issue, authority, acceptance, dependencies and reserved decisions recorded.

## 2. Transition

Add a fenced `scope` JSON packet when the changed paths are known, such as `{"paths": ["src/feature/", "tests/feature/"], "dependencies": [12]}` (a trailing `/` covers a subtree): `drive` estimates risk from its paths. A follow-up to an unmerged PR lands in that PR's next round or lists the PR in `dependencies`. Before filing a `type:bug` or `type:chore`, run `issue create --check`; comment on a listed issue with the same outcome instead. Re-read before writing. Replace conflicting family labels; preserve others and owner holds.

| Actor | Transition | Condition and consequence |
| --- | --- | --- |
| Orchestrator | `lane:owner` | Owner participation required (reserved decisions, credentials, devices); record what agents can prepare. |
| Orchestrator | remove `lane:owner` | Participation resolved and authority covers the rest; ready and unblocked goes to Todo. |
| Product partner | one `type:*` | Actual outcome changes type; an epic has no work lane. |
| `drive` | `state:started` | Exclusive assignment; In Progress. |
| `drive` | remove execution label | PR marked ready; Review, the open PR still excludes reassignment. |
| `drive` | one `risk:R*` on a PR | Set when the draft opens; raised, never lowered. |
| Reviewer | add/remove own `review:owner` | An approval with `verdict=owner` needs the owner, or that gate clears; never erase an explicit owner hold. |
| Orchestrator | close routine slice | Merged evidence proves authorized criteria; Done. |
| Orchestrator | close epic | Closed slices delivered to test cover every criterion; Done. |
| Orchestrator | close product milestone | Exact release evidence proves deployed acceptance; Done. |
| `drive` | remove execution label | Completed, returned or reverted; record evidence or replan. |

Temporary dependency, CI, capability or owner waits retain lane, milestone and assignment. Record cause, actor, resume condition and evidence; never overwrite active claims. Scope or authority changes need their own decision. With a board: Todo for ready work, In Progress for active work and draft PRs, Review once its PR is ready (`Part of` until deployed acceptance), Done for verified slices, delivered epics or accepted milestones. Draft epics stay in Backlog; approved ones are In Progress. Without a board use priority labels; status never grants authority.

**Exit gate:** one type and milestone, `lane:owner` only where the owner takes part, with waits and actors explicit.

## 3. Record

Preserve template markers; write summary, scope, risks, decision and acceptance, with estimate/packet when applicable. Link merged evidence per criterion. Duplicate or withdrawn scope needs its decision. Re-read the saved issue.

**Exit gate/output:** at most 5 lines: **Summary:** issue, criteria, lanes and waits. **Decision:** next action/actor or reserved options and recommendation.
