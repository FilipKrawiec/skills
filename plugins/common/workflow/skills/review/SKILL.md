---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area, for architectural boundary breaches, runtime defects, design smells and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Code Review

Review on two axes, A Standards and B Spec; report only what gates miss. For a whole area, run the Area Audit in [design-smells.md](references/design-smells.md) instead.

## Severity

- **Blocker** (`REQUEST_CHANGES`): runtime defect, unhandled edge, boundary breach, hollow or failing test.
- **Major** (`REQUEST_CHANGES` when the diff introduces it): smell likely to cause a defect or rework soon.
- **Minor** (`APPROVED`, as suggestions): style, naming, optional refactor.

*Blocking* means `REQUEST_CHANGES`. Before the PR opens, fix every finding, Minors included, and re-review; after, Minors never hold it. Ask the owner what needs an owner decision.

## 1. Scope

Take the diff (branch against base, `git diff HEAD~1`, or staged) and the issue's criteria. Give each axis a fresh-context worker holding only diff, issue and axis; without workers, run them in order.

*Exit gate*: diff and criteria in hand; each axis assigned.

## 2. Axis A: Standards

1. `domain/` imports no outer layer and carries no framework, ORM or serialization annotations; inbound adapters always call a use case.
2. Aggregate children change only through their root; one aggregate per transaction; cross-aggregate changes are domain events.
3. An interface needs two implementations (a test fake counts); no 1:1 DTO chains or passthrough modules.
4. An outer layer maps a domain enum in one mapper; exhaustive matching on a sealed data type is fine.
5. Changed presentation keeps its semantics, accessibility and layout.
6. Smells from [design-smells.md](references/design-smells.md), with their fix. Invoke `ddd` or `hexagonal-architecture` for modeling or layering doubts.

*Exit gate*: each finding has severity, `file:line`, a failure scenario and one remedy.

## 3. Axis B: Spec

1. An observable test proves every criterion.
2. Hunt runtime defects: empty and boundary cases, unchecked nil, swallowed errors, races, missing `await`, leaks on an exit path, repeated commands duplicating side effects.
3. Tests assert state and events, not mock calls, with independently sourced expected values and failure paths.
4. **Blocker on every diff:** a coverage-only test, a structure-coupled assertion, or a test reaching around the design (test-only hook, private state, lowered threshold, new exemption). When tests change, check every Test Rigor row in [design-smells.md](references/design-smells.md).
5. Unasked-for changes are scope creep.

*Exit gate*: as in phase 2.

## 4. Verdict

Merge both axes, most severe first; ≤ 15 lines; omit a silent axis.

```text
Decision: APPROVED | REQUEST_CHANGES
- [Blocker|Major|Minor] [A|B] <file:line> — <defect & failure scenario> → <remedy>
Scope: clean | creep: <files>
```
