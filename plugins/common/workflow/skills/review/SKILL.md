---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area for defects, specification compliance, design and test rigor.
allowed-tools: Skill Read Bash(git:*,node:*)
---

# Code Review

Review independently of the implementer. Judge both **A: standards** and **B: specification**; only `agent-review` posts a binding GitHub decision. Follow stricter repository review requirements. Read [area-audit.md](references/area-audit.md) for a whole area and [hot-paths.md](references/hot-paths.md) for hot paths or startup.

## 1. Establish evidence

Capture base and head, scope, applicable acceptance criteria, owner decisions, earlier findings and test evidence. For a directly requested general audit with no specification, use the requested scope and review purpose; report the absence of a spec. Read the diff, applicable agent rules and `REVIEW.md`. For a re-review, inspect changes since the previous reviewed head and unresolved findings, not the full diff. Carry findings to a new head only after verifying that base and Git tree, acceptance criteria, scope, applicable decisions and rules are unchanged. Otherwise review affected evidence and unresolved findings. Never reopen an answered finding without new evidence.

For low-risk changes, one independent reviewer may judge both axes when repository and owner rules permit. Use separate reviewers when required or for security, authority, concurrency, complex behavior or unclear risk. Supply the smallest sufficient context; do not rely on a worker inheriting the chat.

```text
Review <A|B|both> independently; do not edit or post.
Intent/criteria/decisions: <issue, scope, constraints, prior decisions>.
Checkout: <worktree>; base <SHA>; head <SHA>; last reviewed <SHA|none>.
Evidence: <changed paths, tests, captures, findings and repairs>.
Return findings, exact base/head, evidence and missing information in <=8 lines.
```

**Exit gate:** scope, applicable criteria, diff and reviewers for both axes identified; missing required issue or PR criteria blocks approval pending repair or refinement.

## 2. Review

- **A — standards:** check architecture and ownership boundaries, accessibility and layout, duplicated concepts, inconsistent mappings, and stale project rules. Name a design smell only when it can cause a concrete defect or rework.
- **B — specification:** trace acceptance criteria and observable outcomes; check edge cases, failures, security, concurrency, cleanup and relevant tests. Flag scope creep, hollow tests, test-only production paths, weakened thresholds and missing meaningful coverage.

Report only introduced, actionable defects with a read `file:line`, failure scenario and remedy; omit lint and unrelated pre-existing issues. A runtime/security defect, unhandled edge, boundary breach or hollow/failing test is a Blocker; a design smell likely to cause defects or rework is a Major. A confirmed Blocker or introduced Major blocks. List at most three optional suggestions separately.

A finding blocks only after a reviewer independent of its author and the implementer verifies it against the head. The binding reviewer may be that verifier. Verification confirms or rejects only the named finding; do not repeat an established decision without new evidence.

**Exit gate:** both axes and any blocking findings independently evaluated.

## 3. Report

Return at most 8 lines: `APPROVED` or `REQUEST_CHANGES`; each confirmed blocking finding with severity, axis, location, failure and remedy; optional suggestions; scope; exact base/head; checks and missing evidence. A new head needs an exact-head verdict, which may reuse unchanged evidence as above.

**Exit gate:** exact-head verdict or named missing evidence.
