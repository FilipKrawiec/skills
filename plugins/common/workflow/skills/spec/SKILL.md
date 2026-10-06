---
name: spec
description: Use when a need or bug report should become a GitHub issue, an issue needs acceptance criteria, a scope packet and a lane (01 Define, 02 Spec), or issues need triage into lanes or tidying into the standard issue form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec (01 Define, 02 Spec)

Turn a raw need into one issue, then turn the issue's business wording into requirements another developer or agent can plan from without guessing, and give it one lane. Its output is the issue and its lane. Card moves follow [board.md](../../references/board.md).

**With the owner:** every phase. **Unattended:** phase 4 only; follow-ups go in the run's output instead of new issues.

Every open issue carries exactly one lane: `lane:afk` (the owner approved unattended delivery), `lane:proposed` (you recommend AFK) or `lane:owner` (needs a decision, credentials, settings, a device, or the owner is steering it). `lane:afk` is the owner's decision: apply it only when the owner says yes in the current session.

## INVEST

Every issue this skill writes or lanes is checked against these six. Phase 3 grills each failing check until it holds or the owner waives it in the issue.

| Check | Holds when |
| --- | --- |
| Independent | No other open issue has to merge in the same PR or release with it, and none of its dependencies depends back on it. |
| Negotiable | The description states the outcome and its constraints; implementation steps are left to `plan`. |
| Valuable | Merging it alone gives a user a behaviour or the owner a named benefit (a removed risk, a faster build); a layer that pays off only with another issue fails. |
| Estimable | It carries an estimate (S, M or L) and one sentence on the main unknown behind it. |
| Small | The estimate is S or M. An L is split into vertical slices: with the owner, on their yes, create one issue per slice through phases 1 to 3, link each as a sub-issue and label the parent `type:epic`, then move its card to In progress (Epics in [board.md](../../references/board.md)); unattended, propose the slices in the triage comment. Slices that touch the same element (a shared widget, a baseline or ratchet file) name the one slice that owns it; the others list it under their exclusions. |
| Testable | Each acceptance criterion can be proven by a test or by a render the issue describes. |

## 1. Define

Skip to phase 2 when the issue exists. Otherwise capture the problem and the outcome that shows it is solved, why it matters now, candidate non-goals, risks, dependencies, and open questions marked as open. Search open and closed issues for the same intent (`gh issue list -s all --search "<keywords>"`, with `-R <owner/repo>` when the caller names another repository; `gh issue create` takes the same flag); when one matches, offer to update it instead. Work that only runs or tracks tests (an acceptance pass, a test-run cleanup) becomes acceptance criteria of the issues it proves. Create the issue with the project's template: title `<type>(<area>): <outcome>`, the intent as the description, the open questions as a list, one type label (Issue types in [board.md](../../references/board.md)), a priority when the owner gave one (Priority in [board.md](../../references/board.md)), and `lane:owner`. Card: Backlog (the board adds it there).

**Exit gate:** the issue URL, with intent and open questions.

## 2. Ground

Read the issue, then the sources that exist in this project: task-relevant code and tests, agent rules (`AGENTS.md` or the host's equivalent), ADRs and the glossary. Stop once the decision frontier is clear. Record each verified fact with its source path.

**Exit gate:** verified facts are separated from open decisions.

## 3. Grill

Ask one sharp decision question at a time: scope boundaries, trade-offs, edge cases, the testable form of each criterion, and each failing INVEST check. Each round is at most five lines: the question, the trade-offs, and your recommendation with its reason, so the host can present it natively. Wait for the answer before the next round. Then update the issue so planning reads it rather than this conversation:

- Intent and non-goals in the description.
- `### Acceptance criteria` that pass Testable.
- An estimate that passes Estimable and Small.
- A scope packet: ```` ```scope ```` then `{"paths": ["src/feature/", "tests/feature/"], "dependencies": [12]}`. A trailing `/` allows a subtree; list every issue it builds on, including ones named only in prose.
- An ADR only when the outcome is an architectural decision.

**Exit gate:** every branch of the design tree is decided, and the issue has intent, acceptance criteria, an estimate and a scope packet whose JSON parses.

## 4. Lane

An issue is AFK-ready when all five hold:

| Check | Holds when |
| --- | --- |
| INVEST | Each of the six checks above holds or carries the owner's waiver. |
| Bounded | The scope packet lists the paths it may change, with the package manifest and lockfile when a criterion needs a library the project lacks (such as opening a link), and every dependency. When the main unknown is how existing code handles real input (which files a parser reads), a run on a real sample shows the work stays inside those paths. |
| Decided | No open product, design or model question; new UI has a mockup or names an existing pattern. When the issue promises no visible change, each control a criterion moves or replaces shows where and as it does today on every layout the screen has; one that would show differently is an open design question. |
| Unprivileged | Nothing protected by the project's lanes.json: automation, agent instructions, infrastructure, credentials, settings, releases, deploys. |
| Single | A story, chore or bug, not `type:epic` or `type:task`; no open PR, `state:claimed` or `state:started`. |

- With the owner: offer your check result as a recommendation and ask whether it is AFK. Yes → `lane:afk`; no → `lane:owner`; unsure → `lane:proposed`.
- Triage (unattended, or issues without a lane from `gh issue list --search "-label:lane:afk -label:lane:proposed -label:lane:owner"`): all checks pass → `lane:proposed`, any fails → `lane:owner`; apply the Issue form in [board.md](../../references/board.md); comment once with the failing checks and what would fix each, ending a proposal with "Apply `lane:afk` to let an AFK run take it."
- Tidy (when asked): apply the Issue form to every open issue and every card on the board in one pass, listing the owner's fixes in the output instead of commenting.
- When an epic gains or changes binding design (a mockup, a decision), re-run Decided on each of its open slices in the same session: amend the slice's criteria, or move it to `lane:owner` with a comment so a claimed run parks. Each slice names the designs that bind it, or says none do.
- When merged PRs already meet the acceptance criteria, comment the evidence (one PR link per criterion) and propose closing; the owner closes.
- With a board, move each issue that now has acceptance criteria, a scope packet and a lane to Todo.

**Exit gate:** each issue has one lane and at most one new comment, and each specced issue's card is in Todo when there is a board.

## Output

In [board.md](../../references/board.md)'s Reporting to the owner form. Summary: one line per lane listing its issues; failing checks stay in each issue's triage comment. Decision: the issues awaiting the owner's lane, each with your recommended lane.
