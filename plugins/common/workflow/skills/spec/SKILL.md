---
name: spec
description: Use when refining an issue into implementation requirements (phase 02 Spec), grilling a change against project context and ADRs, triaging issues into delivery lanes, deciding what an agent may deliver unattended (AFK), or reconciling issues with merged work.
allowed-tools: Read Bash(gh:*,git:*)
---

# Spec (02)

Turn an issue's business wording into implementation requirements another developer or agent can plan from without guessing, then give it one lane. Its output is the updated issue and its lane.

Unattended runs do phase 4 (triage) only.

When the project has a board, move each specified issue's card to 02 Spec per [board.md](../../references/board.md).

Every open issue carries exactly one lane: `lane:afk` (the owner approved unattended delivery), `lane:proposed` (you recommend AFK) or `lane:owner` (needs a decision, credentials, settings, a device, or the owner is steering it). `lane:afk` is the owner's decision: apply it only when the owner says yes in the current session.

## 1. Ground

Read the issue, then the sources that exist in this project: task-relevant code and tests, agent rules (`AGENTS.md` or the host's equivalent), ADRs and the glossary. Stop once the decision frontier is clear. Record each verified fact with its source path.

**Exit gate:** verified facts are separated from open decisions.

## 2. Grill

Ask one sharp decision question at a time: scope boundaries, trade-offs, edge cases, the testable form of each criterion. Each round is at most five lines: the question, the trade-offs, and your recommendation with its reason, so the host can present it natively. Wait for the answer before the next round.

**Exit gate:** every branch of the design tree is decided.

## 3. Write the spec

Update the issue so planning reads it rather than this conversation:

- Intent and non-goals in the description.
- `### Acceptance criteria`: each one observable by a test or a render the issue describes.
- An estimate (S, M or L) naming the uncertainty behind it.
- A scope packet: ```` ```scope ```` then `{"paths": ["src/feature/", "tests/feature/"], "dependencies": [12]}`. A trailing `/` allows a subtree; list every issue it builds on, including ones named only in prose.
- An ADR only when the outcome is an architectural decision.

**Exit gate:** the issue has intent, acceptance criteria, an estimate and a scope packet whose JSON parses.

## 4. Lane

An issue is AFK-ready when all five hold:

| Check | Holds when |
| --- | --- |
| Observable | Acceptance criteria can be proven by tests or by renders the issue describes. |
| Bounded | The scope packet lists the paths it may change and every dependency. |
| Decided | No open product, design or model question; new UI has a mockup or names an existing pattern. |
| Unprivileged | Nothing protected by the project's lanes.json: automation, agent instructions, infrastructure, credentials, settings, releases, deploys. |
| Single | Not an epic; no open PR, `state:claimed` or `state:started`. |

- With the owner present: offer your check result as a recommendation and ask whether it is AFK. Yes → `lane:afk`; no → `lane:owner`; unsure → `lane:proposed`.
- Triage (unattended, or issues without a lane from `gh issue list --search "-label:lane:afk -label:lane:proposed -label:lane:owner"`): all checks pass → `lane:proposed`, any fails → `lane:owner`; add missing `type:` and `priority:` labels; comment once with the failing checks and what would fix each, ending a proposal with "Apply `lane:afk` to let an AFK run take it."
- When merged PRs already meet the acceptance criteria, comment the evidence (one PR link per criterion) and propose closing; the owner closes.

**Exit gate:** each issue has one lane and at most one new comment.

## Output

One table (issue, lane, failing checks or "ready"), then the issues awaiting the owner's lane decision.
