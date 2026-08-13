# Rust Test Guidelines

## Default Stack

- Runner: built-in `cargo test`.
- Assertions: `assert!`, `assert_eq!`, `assert_ne!`; add assertion crates only when the project already uses them.
- Mocks: prefer hand-written fakes for traits; use `mockall` when interaction verification is clearer than a fake.
- Acceptance: `cucumber` crate only when Gherkin is a team-facing contract.

## Scenario Shape

- Use snake_case test names with Given/When/Then clauses: `given_empty_store_when_submitting_thread_then_it_is_saved`.
- Keep unit tests in `#[cfg(test)] mod tests`; keep black-box integration tests under `tests/`.
- Assert return values and state first; verify mock expectations only for outbound trait boundaries.
- In async tests, use the runtime already chosen by the project, commonly `#[tokio::test]`.

## Component And Acceptance Tests

- Use Cargo's target boundaries as the source-set equivalent:
  - `#[cfg(test)] mod tests` with `cargo test --lib` for fast unit tests.
  - `tests/component/*.rs` or `tests/component.rs` with `cargo test --test component` for booted in-process components.
  - `tests/integration/*.rs` or `tests/integration.rs` with `cargo test --test integration` for adapters, messaging, or real infrastructure.
  - `tests/system/*.rs` or `tests/system.rs` with `cargo test --test system` for black-box deployed-service checks.
- Use workspace crates or feature-gated test helpers when suites need different dependencies or expensive setup.
- Bind servers to port `0` for parallel test safety; abort spawned server tasks or hold explicit drop guards.
- Use `testcontainers` only at integration/system boundaries that must exercise real infrastructure.
- Keep Cucumber worlds and step definitions thin: manage scenario state, call APIs, and assert externally visible outcomes.
