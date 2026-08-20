# Runtime Defect Hunting, Edge Cases & Test Rigor Catalog

This reference details concrete runtime defect patterns, edge-case failure modes, and test assertion evaluation criteria for adversarial code reviews.

---

## 1. Runtime Defect & Edge-Case Catalog

Inspect diffs for subtle runtime failures, off-by-one errors, state inconsistencies, and unhandled edge cases:

| Defect Category | Common Vulnerabilities & Failure Patterns | Inspection Checkpoint |
| :--- | :--- | :--- |
| **Boundary & Off-by-One** | `<` vs `<=`, slice range index errors, 0-length / empty collections, integer overflow, single-element collections. | Verify loop termination, slice indices, and empty collection handling. |
| **Nil / Null Safety** | Unchecked optional dereferences, uninitialized pointers/structs, missing fallback for missing map/dictionary keys. | Ensure nil checks precede member access; verify default value initialization. |
| **Error Handling & Propagation** | Swallowed exceptions/errors, empty catch blocks, unchecked return error codes, generic catch masking fatal bugs. | Verify every error path is either logged, handled, or explicitly propagated upstream. |
| **State Mutation & Side Effects** | In-place mutation of shared parameters, unintended global state mutation, non-idempotent operations executed on retry. | Verify inputs are treated as immutable where possible; check idempotency across retries. |
| **Concurrency & Async Lifecycle** | Data races, unlocked shared state, missing `await`/async synchronization, unhandled rejection in background tasks. | Inspect concurrent reads/writes for proper synchronization; verify task cancellation handling. |
| **Resource Leaks** | Unclosed file handles, database connections, lingering event listeners, unreleased locks on error exit. | Verify cleanup handlers (`defer`, `finally`, context managers `with`) exist on all exit paths. |
| **Input Validation** | Unsanitized input, missing range or format validation, implicit type conversions leading to truthy/falsy bugs. | Verify validation at system boundaries before processing domain logic. |

---

## 2. Test Assertion Rigor & Quality Criteria

Audit test additions and modifications to ensure high diagnostic value:

| Test Anti-Pattern | Symptom & Risk | Remediation |
| :--- | :--- | :--- |
| **Mock Tautology** | Test only asserts that a mock was called with specific arguments without verifying resulting state or domain events. | Switch to Chicago-style state verification: assert concrete state transitions on the system under test. |
| **Happy-Path Only** | Test suite only tests valid inputs, omitting boundary conditions, nil inputs, and failure modes. | Mandate dedicated test cases for error returns, invalid inputs, and boundary limits. |
| **Hollow / Vacuum Assertions** | Assertions that always evaluate to true (`assert True`, asserting non-empty on static constant). | Assert exact expected output values, error types, and mutated entity states. |
| **Fragile Test Coupling** | Tests verifying internal private methods or implementation details rather than observable public contracts. | Test behavior via public port/API boundaries. |
| **Nondeterministic / Flaky Tests** | Tests relying on real system clock (`sleep()`), network latency, or non-deterministic test execution order. | Inject deterministic clock/time provider ports and isolate test state. |
