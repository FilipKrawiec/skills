---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area for whether it delivers its acceptance criteria, fits the system and breaks nothing else, or when verifying review findings.
allowed-tools: Skill Read Bash(git:*,node:*)
---

# Code Review

Review independently of the implementer; only `agent-review` posts to GitHub. Read [area-audit.md](references/area-audit.md) for a whole area and [hot-paths.md](references/hot-paths.md) for hot paths or startup.

## 1. Establish evidence

Capture base and head, scope, acceptance criteria, owner decisions, already-posted findings and test evidence. Read the diff, or only the delta your brief names. Read the target repository's agent rules (AGENTS.md and host rule files) and `REVIEW.md`: they alone define what fits. For a requested audit with no specification, use the requested scope and report the absence of a spec.

**Exit gate:** criteria, rules, diff or delta, and your assigned question known.

## 2. Find

Answer only your assigned question; a finder assigned all of them answers each.

- **Acceptance outcome:** trace each criterion to an observable outcome and a production call site; a unit reached only from tests proves nothing a user observes. Run the manual steps CI cannot and report what you saw. Flag hollow tests, weakened thresholds and scope creep.
- **Correctness:** edge cases, failure paths, security, concurrency, cleanup and data loss in the changed code.
- **Fit:** breaches of the repository's own rules, boundaries and patterns, each citing the rule's `file:line`.
- **Blast radius:** callers, contracts, migrations and configuration outside the diff that the change breaks.

Tag each candidate:

- **Important:** a concrete failure scenario against a criterion, a cited rule or existing behaviour. Only these block.
- **Nit:** a real improvement that breaks nothing.
- **Pre-existing:** a defect the diff did not introduce.

Never report lint, taste, or a rule the repository does not state. Never repeat a finding already posted, answered or resolved.

**Exit gate:** each candidate has a tag, a read `file:line`, a failure scenario and a remedy.

## 3. Verify

As verifier, take each candidate alone against the head: read the cited line, reproduce or trace the failure, and confirm or reject it with evidence. Never add new findings; never upgrade a tag.

**Exit gate:** every candidate confirmed or rejected.

## 4. Report

Return at most 10 lines, one per candidate: `tag file:line failure remedy`, then exact base/head, what you ran with exits, and missing evidence.
