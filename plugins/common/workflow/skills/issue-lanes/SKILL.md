---
name: issue-lanes
description: Use when creating a GitHub issue, sorting or labelling issues into delivery lanes, deciding which issues an agent may deliver unattended (AFK), or reconciling open issues against work already merged.
allowed-tools: Read Bash(gh:*,git:*,python3:*)
---

# Issue Lanes

Every open issue carries exactly one lane: `lane:afk` (the owner approved unattended delivery), `lane:proposed` (you recommend AFK) or `lane:owner` (needs a decision, credentials, settings, a device, or the owner is steering it). `lane:afk` is the owner's decision: you apply it only when the owner says yes in the current session.

## 1. Check

An issue is AFK-ready when all five hold:

| Check | Holds when |
| --- | --- |
| Observable | Acceptance criteria can be proven by tests or by renders the issue describes. |
| Bounded | A ```` ```scope ```` packet lists `paths` it may change and every issue it builds on in `dependencies`, including ones only named in prose. |
| Decided | No open product, design or model question; new UI has a mockup or names an existing pattern. |
| Unprivileged | Nothing protected by the project's lanes.json: automation, agent instructions, infrastructure, credentials, settings, releases, deploys. |
| Single | Not an epic; no open PR, `state:claimed` or `state:started`. |

Scope packet format: ```` ```scope ```` then `{"paths": ["src/feature/", "tests/feature/"], "dependencies": [12]}`; a trailing `/` allows a subtree.

**Exit gate:** a pass or fail per check, with the fix for each failure.

## 2. Create

When you write a new issue, follow the project's issue template and aim to pass all five checks. Before creating it, ask the owner whether it should be AFK, offering your check result as the recommendation:

- Yes → create it with `lane:afk`.
- No → `lane:owner`.
- Unsure → `lane:proposed`.

Unattended runs create no issues.

**Exit gate:** the issue URL and its lane, chosen by the owner.

## 3. Triage

For each open issue without a lane (`gh issue list --search "-label:lane:afk -label:lane:proposed -label:lane:owner"`), or the ones the owner names:

1. All checks pass → `lane:proposed`; any fails → `lane:owner`. Add missing `type:` and `priority:` labels.
2. Comment once: the failing checks and what would fix each. For a proposal, end with "Apply `lane:afk` to let an AFK run take it."
3. When merged PRs already meet the acceptance criteria, comment the evidence (one PR link per criterion) and propose closing; the owner closes.

**Exit gate:** every triaged issue has one lane and at most one new comment.

## Output

One table (issue, lane, reason in a few words), then the proposed issues awaiting the owner's approval.
