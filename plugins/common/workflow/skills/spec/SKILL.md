---
name: spec
description: Use when a need or bug report should become a GitHub issue, an issue needs acceptance criteria or a lane (01 Define, 02 Spec), or issues need triage into lanes or tidying into the standard issue form.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec (01 Define, 02 Spec)

Turn a raw need into one issue whose requirements another developer or agent can plan from without guessing, and give it one lane. Card moves, issue types, priority and the issue form follow [board.md](../../references/board.md).

**With the owner:** every phase. **Unattended:** phase 4 only, plus phase 1 when `improve` opens a lesson issue; other follow-ups go in the run's output instead of new issues.

Every open issue carries exactly one lane: `lane:afk` (the owner approved unattended delivery), `lane:proposed` (you recommend AFK) or `lane:owner` (needs a decision, credentials, settings, a device, or the owner is steering it). Apply `lane:afk` only when the owner says yes in the current session.

Every issue needs only its type, its outcome, `### Acceptance criteria` and a lane. An estimate and a scope packet are added when the issue is proposed for AFK (phase 4 checks them, `lanes.py next` requires the packet); without a packet, a PR that changes code goes to the owner to merge (owner rule 8).

## 1. Define

Skip to phase 2 when the issue exists. Search open and closed issues for the same intent (`gh issue list -s all --search "<keywords>"`, with `-R <owner/repo>` when the caller names another repository, as `gh issue create` takes too); when one matches, offer to update it instead. Work that only runs or tracks tests (an acceptance pass, a test-run cleanup) becomes acceptance criteria of the issues it proves. Otherwise create the issue with the project's template: title `<type>(<area>): <outcome>`, the outcome that shows the need met, non-goals and open questions when there are any, one type label, a priority when the owner gave one, and `lane:owner`.

**Exit gate:** the issue URL, with intent and open questions.

## 2. Ground

Read the issue, then the sources that exist in this project: task-relevant code and tests, agent rules, ADRs and the glossary. Stop once the decision frontier is clear. Record each verified fact with its source path.

**Exit gate:** verified facts are separated from open decisions.

## 3. Grill

Ask one sharp decision question at a time, only for decisions still open: scope boundaries, trade-offs, edge cases and the testable form of each criterion. Each round is at most five lines: the question, the trade-offs, and your recommendation with its reason. Wait for the answer before the next round. Then update the issue so planning reads it rather than this conversation:

- Intent and non-goals in the description.
- `### Acceptance criteria`, each provable by a test or by a render the issue describes.
- When the work needs more than one PR: on the owner's yes, one issue per vertical slice through phases 1 to 3, each linked as a sub-issue, the parent labelled `type:epic` with its card in In progress. Slices that touch the same element (a shared widget, a baseline or ratchet file) name the one slice that owns it; the others list it under their exclusions.
- An ADR only when the outcome is an architectural decision.

**Exit gate:** every open decision is answered, and the issue has intent and acceptance criteria.

## 4. Lane

An issue is AFK-ready when every check holds or carries the owner's waiver in the issue:

| Check | Holds when |
| --- | --- |
| Single | A story, chore or bug, not `type:epic` or `type:task`; no open PR, `state:claimed` or `state:started`. |
| Independent | No other open issue has to merge in the same PR or release with it, and none of its dependencies depends back on it. |
| Valuable | Merging it alone gives a user a behaviour or the owner a named benefit; a layer that pays off only with another issue fails. |
| Small | `### Estimate` is S or M, with one sentence on the main unknown; an L is split as phase 3 says (unattended: the triage comment proposes the slices). |
| Bounded | A scope packet, ```` ```scope ```` then `{"paths": ["src/feature/", "tests/feature/"], "dependencies": [12]}`, lists the paths it may change (a trailing `/` allows a subtree; the package manifest and lockfile when a criterion needs a library the project lacks) and every issue it builds on, including ones named only in prose. When the main unknown is how existing code handles real input, a run on a real sample shows the work stays inside those paths. |
| Decided | No open product, design or model question; new UI has a mockup or names an existing pattern. When the issue promises no visible change, each control a criterion moves or replaces shows where and as it does today on every layout the screen has; one that would show differently is an open design question. |
| Unprivileged | Nothing protected by the project's lanes.json: automation, agent instructions, infrastructure, credentials, settings, releases, deploys. |

- With the owner: when the checks hold, add the estimate and scope packet, offer the result as a recommendation and ask whether it is AFK. Yes → `lane:afk`; no → `lane:owner`; unsure → `lane:proposed`.
- Triage (unattended, or issues without a lane from `gh issue list --search "-label:lane:afk -label:lane:proposed -label:lane:owner"`): all checks pass → `lane:proposed`, any fails → `lane:owner`; apply the Issue form; comment once with the failing checks and what would fix each, ending a proposal with "Apply `lane:afk` to let an AFK run take it."
- Tidy (when asked): apply the Issue form to every open issue and every card on the board in one pass, listing the owner's fixes in the output instead of commenting.
- When an epic gains or changes binding design (a mockup, a decision), re-run Decided on each of its open slices in the same session: amend the slice's criteria, or move it to `lane:owner` with a comment so a claimed run parks. Each slice names the designs that bind it, or says none do.
- When merged PRs already meet the acceptance criteria, comment the evidence (one PR link per criterion) and propose closing; the owner closes.
- With a board, move each issue that is now Ready (board.md's States) to Todo.

**Exit gate:** each issue has one lane and at most one new comment, and each specced issue's card is in Todo when there is a board.

## Output

In board.md's Reporting to the owner form. Summary: one line per lane listing its issues. Decision: the issues awaiting the owner's lane, each with your recommended lane.
