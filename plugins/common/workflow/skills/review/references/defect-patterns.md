# Defect Hunting, Architectural Smells & Test Rigor Catalog

This reference details concrete defect patterns, code smell indicators, and test assertion evaluation criteria for adversarial code reviews.

---

## 1. Logic, Correctness & Edge-Case Defect Catalog

Inspect diffs for subtle runtime failures, off-by-one errors, state inconsistencies, and unhandled edge cases:

| Defect Category | Common Vulnerabilities & Failure Patterns | Inspection Checkpoint |
| :--- | :--- | :--- |
| **Boundary & Off-by-One** | `<` vs `<=`, slice range index errors, 0-length / empty collections, maximum integer overflow, single-element collections. | Verify loop termination, slice indices, and empty collection handling. |
| **Nil / Null Safety** | Unchecked optional dereferences, uninitialized pointers/structs, missing fallback for missing dictionary keys. | Ensure nil checks precede member access; verify default value initialization. |
| **Error Handling & Propagation** | Swallowed exceptions/errors, empty catch blocks, unchecked return error codes, generic catch masking fatal bugs. | Verify every error path is either logged, handled, or explicitly propagated upstream. |
| **State Mutation & Side Effects** | In-place mutation of shared parameters, unintended global state mutation, non-idempotent operations executed on retry. | Verify inputs are treated as immutable where possible; check idempotency across retries. |
| **Concurrency & Async Lifecycle** | Data races, unlocked shared state, missing `await`/async synchronization, unhandled rejection in background tasks. | Inspect concurrent reads/writes for proper synchronization; verify task cancellation handling. |
| **Resource Leaks** | Unclosed file handles, database connections, lingering event listeners, unreleased locks on error exit. | Verify cleanup handlers (`defer`, `finally`, context managers `with`) exist on all exit paths. |
| **Input Validation** | Unsanitized input, missing range or format validation, implicit type conversions leading to truthy/falsy bugs. | Verify validation at system boundaries before processing domain logic. |

---

## 2. Architectural Doctrine & Code Smells

Inspect diffs for structural erosion, boundary breaches, and maintainability antipatterns:

| Smell / Principle | Description & Warning Signs | Remediation |
| :--- | :--- | :--- |
| **Hexagonal Boundary Violation** | `domain/` importing from `infrastructure/`, `api/`, or `application/`; ORM models leaking into domain aggregates. | Move external contracts to domain ports; invert dependency injection. |
| **Feature Envy** | A method accesses data and methods of another object more than its own. | Move method onto the data-owning entity or aggregate. |
| **Primitive Obsession** | Using primitives (`str`, `int`) for domain concepts with validation rules (e.g. Email, Money, UserId). | Encapsulate into validated Value Objects. |
| **Shotgun Surgery** | A single logical change requires making small edits across many distinct files. | Consolidate scattered logic into a single cohesive aggregate or module. |
| **Speculative Generality** | Interfaces, DTOs, or parameters added for hypothetical future requirements. | Apply YAGNI and delete unneeded abstractions. |
| **Rule of Two Adapters** | Creating an interface or port without at least two distinct concrete implementations. | Replace premature interface with concrete implementation until a second adapter exists. |

---

## 3. Test Assertion Rigor & Quality Criteria

Audit test additions and modifications to ensure high diagnostic value:

| Test Anti-Pattern | Symptom & Risk | Remediation |
| :--- | :--- | :--- |
| **Mock Tautology** | Test only asserts that a mock was called with specific arguments without verifying resulting state or domain events. | Switch to Chicago-style state verification: assert concrete state transitions on the system under test. |
| **Happy-Path Only** | Test suite only tests valid inputs, omitting boundary conditions, nil inputs, and failure modes. | Mandate dedicated test cases for error returns, invalid inputs, and boundary limits. |
| **Hollow / Vacuum Assertions** | Assertions that always evaluate to true (`assert True`, asserting non-empty on static constant). | Assert exact expected output values, error types, and mutated entity states. |
| **Fragile Test Coupling** | Tests verifying internal private methods or implementation details rather than observable public contracts. | Test behavior via public port/API boundaries. |
