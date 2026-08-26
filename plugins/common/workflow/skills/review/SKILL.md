---
name: review
description: Use when auditing a git diff, branch, pull request, or staged changes against architectural fitness, Clean Code craftsmanship, Fowler refactoring patterns, defect hunting, and test rigor.
allowed-tools: Read Bash(git:*)
---

# Solution Architect & Tech Lead Code Review

Conduct rigorous, authoritative code reviews on active diffs (`git diff HEAD~1` or staged changes) from the dual perspectives of a Solution Architect (evaluating boundaries, system qualities, modularity, and evolutionary fitness) and a Tech Lead (mentoring clean code craftsmanship, Fowler refactoring moves, SOLID principles, and test rigor).

## Review Protocol

Evaluate the changes across four orthogonal audit axes. Enforce a **Strict Zero-Defect & Craftsmanship Policy**: any unhandled edge case, runtime defect, architectural boundary breach, Fowler code smell, or hollow test mandates a `REQUEST_CHANGES` decision with actionable refactoring instructions.

### Phase 1: Architectural Fitness & Boundary Governance
Audit diffs against macro-architectural invariants and system qualities:
1. **Hexagonal & Layer Dependency Direction**: Verify dependencies flow inward toward domain core. `domain/` must never import `application/`, `infrastructure/`, or `api/`.
2. **Domain Purity & DDD Boundaries**: Verify Aggregates and Value Objects are isolated from framework annotations, ORM models, and serialization schemas. Verify bounded context isolation.
3. **Module Depth & Blast Radius**: Check for high cohesion, low coupling, and deep modules with small interfaces over shallow passthrough wrappers.
4. **Presentation Layer & UI Blast Radius**: When presentation or UI components are modified, verify DOM/accessibility invariance and visual preservation without regressions.
5. **Anti-Overengineering & YAGNI**: Enforce the Rule of Two Adapters (reject premature interfaces without >= 2 concrete implementations) and reject speculative generality.
6. **Operational Fitness**: Verify idempotency, explicit state lifecycles, and failure isolation.

### Phase 2: Clean Code Craftsmanship & Refactoring Audit
Audit code quality and prescribe Martin Fowler refactoring patterns:
1. **SOLID Principles**: Verify Single Responsibility, Open/Closed (polymorphism over branching), Liskov Substitution, Interface Segregation, and Dependency Inversion.
2. **Fowler Code Smells**: Identify *Primitive Obsession*, *Feature Envy*, *Data Clump*, *Long Method*, *Complex Conditionals*, *Shotgun Surgery*, and *Inappropriate Intimacy*.
3. **Prescriptive Refactoring Recipes**: When a smell is detected, prescribe the standard Fowler refactoring move (*Extract Method*, *Replace Conditional with Polymorphism*, *Introduce Value Object*, *Encapsulate Collection*, *Separate Query from Modifier*).
4. **Clean Code Invariants**: Enforce *Tell, Don't Ask*, *Law of Demeter*, *Boy Scout Rule*, and domain-expressive naming.

### Phase 3: Runtime Defect Hunting & Resilience
Audit changes for runtime correctness, defensive safety, and boundary edge cases:
1. **Boundary & Off-by-One**: Verify loop limits, slice indices, 0-length collections, and boundary values.
2. **Nil / Error Safety**: Verify optional dereferences, unhandled error returns, swallowed exceptions, and nil propagation.
3. **Concurrency & Async Lifecycle**: Inspect unintended state mutations, thread-safety/data races, missing `await` synchronizations, and unhandled task failures.
4. **Resource Management**: Verify proper resource cleanup (`defer`, `finally`, context managers) on all exit paths.

### Phase 4: Verification Rigor & Specification Compliance
Audit test additions against acceptance criteria and verification depth:
1. **Acceptance Criteria Verification**: Confirm every requirement is proven by observable test evidence.
2. **Chicago-Style State Verification**: Reject mock tautologies and hollow vacuum assertions (`assert True`). Verify tests assert observable state transitions and domain events.
3. **Failure Path & Boundary Coverage**: Confirm error handling and invalid input paths are tested, not just the happy path.
4. **Scope Boundary**: Flag unasked-for modifications and scope creep.

### Phase 5: Solution Architect Verdict & Actionable Remediation
Synthesize findings into an authoritative review verdict:
1. Output unambiguous decision (`APPROVED` or `REQUEST_CHANGES`).
2. Provide concrete, high-leverage Tech Lead remediation instructions specifying the exact Fowler refactoring pattern or architectural adjustment required.

## Output Envelope

Emit review findings using this structured compact envelope:

```text
### Axis 1: Architectural Fitness & Boundaries
- [PASS | ISSUE]: [file:line link](file:///path/to/file#L10) — <terse finding & architectural rationale>

### Axis 2: Clean Code & Refactoring Prescriptions
- [PASS | ISSUE]: [file:line link](file:///path/to/file#L25) — <smell / principle>: <prescribed Fowler refactoring recipe & target structure>

### Axis 3: Runtime Defect Hunting & Resilience
- [PASS | ISSUE]: [file:line link](file:///path/to/file#L40) — <edge case / defect & failure scenario>

### Axis 4: Specification Compliance & Test Rigor
- [PASS | ISSUE]: <acceptance criteria & Chicago-style state verification status>
- Scope Assessment: [Clean Boundary | Scope Creep Flagged]

### Decision
[APPROVED | REQUEST_CHANGES: <actionable Tech Lead remediation summary with prescribed refactoring pattern>]
```

---

## Context Pointers

- Read [architectural-fitness.md](references/architectural-fitness.md) when evaluating layer boundaries, domain purity, component cohesion, module depth, or operational fitness.
- Read [clean-code-and-refactoring.md](references/clean-code-and-refactoring.md) when auditing SOLID principles, identifying Fowler code smells, or prescribing structural refactoring recipes.
- Read [defect-patterns.md](references/defect-patterns.md) when hunting runtime defects, auditing boundary edge cases, or evaluating test assertion rigor.
