---
name: review
description: Use when auditing a diff, branch, PR or staged changes for architectural boundary breaches, runtime defects, design smells and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Solution Architect & Tech Lead Code Review

Review the active diff (`git diff HEAD~1`, the branch against its base, or staged changes) on two axes: Standards (a Solution Architect guarding boundaries and design) and Spec (a Tech Lead guarding the acceptance criteria, runtime behaviour and test rigor). The same review serves an owner's session and an unattended run.

## Severity Policy

- **Blocker** (runtime defect, unhandled edge case, architectural boundary breach, hollow or failing test) → `REQUEST_CHANGES`.
- **Major** (smell or design issue likely to cause a defect or rework in this area soon) → `REQUEST_CHANGES` only when the diff introduces it.
- **Minor** (style, naming, optional refactoring) → listed as suggestions; the decision stays `APPROVED`.

A finding is *blocking* when it maps to `REQUEST_CHANGES`; `afk` and `agent-review` use that word with this meaning.

Report only what the project's automated gates leave unchecked; skip findings a linter, formatter, or quality gate already enforces.

## Two Axes

Run the two axes as two parallel fresh-context workers when the host offers them (the caller passes each worker only the diff, the issue and its axis below); otherwise take them in order in one pass. Each worker emits findings in the output envelope; the caller merges them, blocking first.

### Axis A: Standards (Solution Architect)

1. Dependencies point inward: `domain/` imports nothing from `application/`, `infrastructure/`, or `api/`, and domain objects carry no framework, ORM, or serialization annotations.
2. Inbound adapters call an application use case, even for trivial queries.
3. Aggregate children change only through their root; one transaction touches one aggregate; cross-aggregate changes travel as domain events.
4. Abstractions earn their place: an interface needs two implementations (Rule of Two Adapters; a port's test fake counts), adjacent layers pass domain types instead of 1:1 DTO chains, and modules are deep rather than passthrough wrappers.
5. When presentation code changes, semantic structure, accessibility attributes, and layout stay intact.
6. Design smells that will cause defects or rework in this area, each with the Fowler refactoring that removes it (e.g. *Introduce Value Object* for primitive obsession, *Move Method* for feature envy).
7. When a finding hinges on domain modeling or layer placement, invoke `ddd` or `hexagonal-architecture` for the governing rule.

### Axis B: Spec (Tech Lead)

1. Every acceptance criterion of the issue is proven by an observable test.
2. Runtime defects the tests miss: boundary and empty-collection cases, unchecked nil and swallowed errors, races and missing `await`, resources released on every exit path, and repeated commands or messages that duplicate side effects.
3. Tests assert state transitions and domain events (Chicago style) rather than mock calls; expected values come from an independent source, not the production algorithm.
4. Failure and invalid-input paths are tested; assertions can fail.
5. Unasked-for modifications are scope creep.

### Verdict

Derive `APPROVED` or `REQUEST_CHANGES` from the severity policy over both axes. Give each Blocker and Major one concrete remedy.

## Output Envelope

Emit issues only, ranked most severe first, each tagged with its axis; axes with nothing to report stay silent. Target ≤ 15 lines total.

```text
Decision: APPROVED | REQUEST_CHANGES
- [Blocker|Major|Minor] [A|B] <file:line> — <defect or smell & failure scenario> → <remedy>
Scope: clean | creep: <files>
```
