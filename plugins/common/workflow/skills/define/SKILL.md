---
name: define
description: Use when turning a raw need, idea, bug report or business request into a GitHub issue (phase 01 Define), before anyone specifies or builds it.
allowed-tools: Read Bash(gh:*,git:*)
---

# Define (01)

Turn a raw need into one issue: a stable place for the work to evolve. Define captures intent; `spec` makes it buildable. This skill writes no code and no plan.

After creating it, run `python3 <the afk skill's directory>/scripts/lanes.py phase <N>` (`LANES phase <N>`) and do the step it prints.

## 1. Capture

From the request and the conversation, write down:

- The problem and the outcome that shows it is solved.
- Why it matters now: who needs it, deadlines, constraints.
- Candidate non-goals, known risks and dependencies.
- Open questions, marked as open rather than assumed.

Ask the owner only what the request leaves out; keep implementation detail out.

**Exit gate:** each point above is filled or marked open.

## 2. Check for duplicates

Search open and closed issues for the same intent (`gh issue list -s all --search "<keywords>"`). When one matches, show it and ask whether to update it instead.

**Exit gate:** no duplicate, or the owner chose the existing issue.

## 3. Create

Create the issue with the project's issue template: title `<type>(<area>): <outcome>`, the captured intent as the description, the open questions as a list, a `type:` label, and `priority:` when the owner gave one. Add `lane:owner`: the owner steers it until `spec` decides its lane. Unattended runs create no issues; they name follow-ups for the owner instead.

**Exit gate:** the issue URL, and `LANES phase <N>` prints `phase: 01 Define`.

## Output

One line: the issue link and its open questions count.
