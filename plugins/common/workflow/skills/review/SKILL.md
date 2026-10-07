---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area, for architectural boundary breaches, runtime defects, design smells and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Code Review

Review a change on two axes: A, Standards (boundaries and design), and B, Spec (acceptance criteria, runtime behaviour and test rigor). Report only what the project's automated gates leave unchecked.

## Severity

| Severity | Finding | Verdict |
| --- | --- | --- |
| Blocker | Runtime defect, unhandled edge case, boundary breach, hollow or failing test | `REQUEST_CHANGES` |
| Major | Smell or design issue likely to cause a defect or rework in this area soon | `REQUEST_CHANGES` when the diff introduces it |
| Minor | Style, naming, optional refactoring | `APPROVED`, listed as suggestions |

A finding is *blocking* when it maps to `REQUEST_CHANGES`; `afk` and `agent-review` use the word this way. The verdict decides whether the change may proceed; the caller fixes every finding, Minors included, before the Open PR step and re-reviews the fix. A finding that needs an owner decision goes to the owner as a question.

## 1. Scope

Take the diff (the branch against its base, `git diff HEAD~1`, or staged changes) and the issue's acceptance criteria. Run the two axes as two parallel fresh-context workers when the host offers them, passing each only the diff, the issue and its axis; otherwise take them in order.

*Exit gate*: the diff and the criteria are in hand, and each axis has its worker or its turn.

## 2. Axis A: Standards

1. Dependencies point inward: `domain/` imports nothing from `application/`, `infrastructure/` or `api/`, and domain objects carry no framework, ORM or serialization annotations.
2. Inbound adapters call an application use case, even for trivial queries.
3. Aggregate children change only through their root; one transaction touches one aggregate; cross-aggregate changes travel as domain events.
4. An interface needs two implementations (Rule of Two Adapters: a port's test fake counts, and so does each case of a conditional repeated across files, as in A.5); adjacent layers pass domain types instead of 1:1 DTO chains; modules are deep rather than passthrough wrappers.
5. Behaviour that varies by kind lives on the kind: when one layer switches on the same enum, type tag or string set in several files to vary the same behaviour, that behaviour moves onto the type (*Replace Conditional with Polymorphism*). A mapping owned by an outer layer (a label, colour or icon for a domain enum) lives in that layer as one mapper. Exhaustive matching on a sealed type whose cases are data (outcomes, events, syntax nodes), each operation in its own module, is the intended use of that type.
6. One concept, one model: a concept parsed, validated or formatted from raw primitives in two places becomes one value object, and a generic the codebase already has (an undo history, a cache, a retry policy) is reused instead of copied.
7. A cross-cutting capability of a component (help text, analytics name, accessibility label) is declared by the component that owns its meaning, through an interface or mixin, rather than wrapped around it at each call site.
8. Changed presentation code keeps its semantic structure, accessibility attributes and layout.
9. Design smells that will cause defects or rework, each with the Fowler refactoring that removes it. When a finding hinges on domain modeling or layer placement, invoke `ddd` or `hexagonal-architecture`.

*Exit gate*: each finding has severity, `file:line`, a failure scenario and one remedy.

## 3. Axis B: Spec

1. Every acceptance criterion is proven by an observable test.
2. Runtime defects the tests miss: boundary and empty-collection cases, unchecked nil and swallowed errors, races and missing `await`, resources released on every exit path, repeated commands that duplicate side effects.
3. Tests assert state transitions and domain events rather than mock calls, take expected values from an independent source, cover failure and invalid-input paths, and would fail if a behaviour a user or caller relies on broke. When the diff changes tests, read the Test Rigor table in [design-smells.md](references/design-smells.md) and report each smell it shows.
4. Unasked-for modifications are scope creep.

*Exit gate*: as in phase 2.

## 4. Verdict

Merge both axes, blocking first, and derive the decision from Severity.

```text
Decision: APPROVED | REQUEST_CHANGES
- [Blocker|Major|Minor] [A|B] <file:line> — <defect or smell & failure scenario> → <remedy>
Scope: clean | creep: <files>
```

Findings only, most severe first; an axis with nothing to report stays silent; at most 15 lines.

## Area Audit

When auditing a whole codebase or area rather than one diff, read [design-smells.md](references/design-smells.md), sweep for each signal, invoke `tdd` to sample mutants on the area's domain files, and report one row per smell, ranked by the defects or rework it is likely to cause, then `tdd`'s per-file mutation table; no line cap.

```text
| Smell | Count | Strongest examples (3 × file:line) | Refactoring | Estimate S/M/L |
```
