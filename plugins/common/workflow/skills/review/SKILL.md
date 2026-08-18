---
name: review
description: Use when auditing a git diff, branch, pull request, or staged changes against logic defects, architectural doctrines, Fowler code smells, and test rigor.
allowed-tools: Read Bash(git:*)
---

# 3-Axis Adversarial Code Review & Quality Audit

Conduct rigorous, adversarial code reviews on active diffs (`git diff HEAD~1` or staged changes) to catch bugs, architectural drift, and testing gaps before merge.

## Review Protocol

Evaluate the changes across three orthogonal audit axes. Enforce a **Strict Zero-Defect Policy**: any unhandled edge case, logic bug, architectural violation, or hollow test mandates a `REQUEST_CHANGES` decision.

### Axis 1: Logic, Edge Cases & Defect Hunting
Audit changes for runtime correctness and boundary resilience:
1. **Edge Cases & Off-by-One**: Verify loop limits, slice indices, empty collections, and boundary values.
2. **Nil / Error Safety**: Verify optional dereferences, unhandled error returns, swallowed exceptions, and nil propagation.
3. **State & Side Effects**: Inspect unintended mutations, concurrency race conditions, and missing resource cleanup.

### Axis 2: Architectural Doctrine, Hexagonal Boundaries & Fowler Smells
Audit changes against structural invariants:
1. **Hexagonal Dependency Direction**: `domain/` must not import from Application, Infrastructure, or API layers.
2. **Domain Purity**: Verify Aggregates and Value Objects encapsulate invariants without framework annotations or ORM leaks.
3. **Fowler Code Smells**: Check for *Feature Envy*, *Primitive Obsession*, *Shotgun Surgery*, and *Speculative Generality*.
4. **Anti-Overengineering & Rule of Two Adapters**: Verify interfaces have at least two concrete implementations.

### Axis 3: Specification Compliance & Test Assertion Rigor
Audit changes against acceptance criteria and verification quality:
1. **Acceptance Criteria**: Verify every requirement is fulfilled with observable tests.
2. **Test Assertion Rigor**: Reject mock tautologies and hollow assertions. Verify Chicago-style state assertions and failure path coverage.
3. **Scope Boundary**: Flag unasked-for modifications and scope creep.

## Output Envelope

Emit findings using this structured compact envelope:

```text
### Axis 1: Logic, Edge Cases & Defect Hunting
- [PASS | ISSUE]: [file:line link](file:///path/to/file#L10) — <terse finding in 1 sentence>

### Axis 2: Standards & Architectural Boundaries
- [PASS | ISSUE]: [file:line link](file:///path/to/file#L30) — <terse finding in 1 sentence>

### Axis 3: Specification Compliance & Test Rigor
- [PASS | ISSUE]: <terse acceptance criteria & test assertion verification status>
- Scope Assessment: [Clean Boundary | Scope Creep Flagged]

### Decision
[APPROVED | REQUEST_CHANGES: <1-line actionable remediation instruction>]
```

---

## Context Pointers

- Read [defect-patterns.md](references/defect-patterns.md) when performing deep adversarial defect inspection, auditing boundary conditions, or evaluating test assertion rigor.
