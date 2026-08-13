---
name: review
description: Use when auditing a git diff, branch, pull request, or staged changes against architectural doctrines, Fowler code smells, and specification requirements.
---

# 2-Axis Code Review & Architectural Audit

Evaluate code diffs against architectural boundaries, clean code invariants, and specification contracts.

## Review Protocol

Inspect the active diff or branch (`git diff HEAD~1` or staged changes) along two orthogonal evaluation axes.

### Axis 1: Standards, Hexagonal Boundaries & Fowler Smells
Evaluate the diff against these four criteria:
1. **Hexagonal Dependency Direction**:
   - `domain/` must not import from Application, Infrastructure, or API layers.
   - `application/` depends only on Domain Ports and Entities.
   - If layer violations are found, cite `hexagonal-architecture`.
2. **Domain Purity**:
   - Verify Aggregates and Value Objects encapsulate invariants without framework annotations or ORM leaks.
3. **Fowler Code Smells**:
   - Check for *Feature Envy*, *Primitive Obsession*, *Shotgun Surgery*, and *Speculative Generality*.
4. **Anti-Overengineering & Rule of Two Adapters**:
   - Verify that interfaces have at least two concrete implementations. Flag unused DTO/mapper chains.

### Axis 2: Specification Compliance & Scope Boundaries
Evaluate the diff against task requirements:
1. **Acceptance Criteria**: Verify every acceptance criterion from the issue or specification is fulfilled with observable tests.
2. **Scope Boundary**: Flag unasked-for modifications, unrelated file formatting, or feature creep.

## Output Envelope

Emit findings using this structured compact envelope:

```text
### Axis 1: Standards & Architectural Boundaries
- [PASS | ISSUE]: [file:line link](file:///path/to/file#L10) — <terse finding in 1 sentence>
- [PASS | ISSUE]: [file:line link](file:///path/to/file#L30) — <terse finding in 1 sentence>

### Axis 2: Specification Compliance & Scope
- [PASS | ISSUE]: <terse acceptance criteria verification status>
- Scope Assessment: [Clean Boundary | Scope Creep Flagged]

### Decision
[APPROVED | REQUEST_CHANGES: <1-line actionable remediation instruction>]
```
