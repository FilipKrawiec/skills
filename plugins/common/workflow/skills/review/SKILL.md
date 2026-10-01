---
name: review
description: Use when auditing a git diff, branch, pull request, or staged changes for runtime defects, architectural boundary breaches, design smells, and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Solution Architect & Tech Lead Code Review

Review the active diff (`git diff HEAD~1`, the branch against its base, or staged changes) as a Solution Architect guarding boundaries and as a Tech Lead guarding craftsmanship and test rigor.

## Severity Policy

- **Blocker** (runtime defect, unhandled edge case, architectural boundary breach, hollow or failing test) → `REQUEST_CHANGES`.
- **Major** (smell or design issue likely to cause a defect or rework in this area soon) → `REQUEST_CHANGES` only when the diff introduces it.
- **Minor** (style, naming, optional refactoring) → listed as suggestions; the decision stays `APPROVED`.

Report only what the project's automated gates leave unchecked; skip findings a linter, formatter, or quality gate already enforces.

## Review Phases

### Phase 1: Architectural Boundaries
1. Dependencies point inward: `domain/` imports nothing from `application/`, `infrastructure/`, or `api/`, and domain objects carry no framework, ORM, or serialization annotations.
2. Inbound adapters call an application use case, even for trivial queries.
3. Aggregate children change only through their root; one transaction touches one aggregate; cross-aggregate changes travel as domain events.
4. Abstractions earn their place: an interface needs two concrete implementations (Rule of Two Adapters), adjacent layers pass domain types instead of 1:1 DTO chains, and modules are deep rather than passthrough wrappers.
5. When presentation code changes, semantic structure, accessibility attributes, and layout stay intact.
6. When a finding hinges on domain modeling or layer placement, invoke `ddd` or `hexagonal-architecture` for the governing rule.

### Phase 2: Runtime Defects
Hunt failure scenarios the tests miss: boundary and empty-collection cases, unchecked nil and swallowed errors, races and missing `await`, resources released on every exit path, and repeated commands or messages that duplicate side effects.

### Phase 3: Design Smells
Flag smells that will cause defects or rework in this area, and name the Fowler refactoring that removes each (e.g. *Introduce Value Object* for primitive obsession, *Move Method* for feature envy).

### Phase 4: Test Rigor & Scope
1. Every acceptance criterion is proven by an observable test.
2. Tests assert state transitions and domain events (Chicago style) rather than mock calls; expected values come from an independent source, not the production algorithm.
3. Failure and invalid-input paths are tested; assertions can fail.
4. Flag unasked-for modifications as scope creep.

### Phase 5: Verdict
Derive `APPROVED` or `REQUEST_CHANGES` from the severity policy. Give each Blocker and Major one concrete remedy.

## Output Envelope

Emit issues only, ranked most severe first; phases with nothing to report stay silent. Target ≤ 15 lines total.

```text
Decision: APPROVED | REQUEST_CHANGES
- [Blocker|Major|Minor] <file:line> — <defect or smell & failure scenario> → <remedy>
Scope: clean | creep: <files>
```
