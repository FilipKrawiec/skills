# Rust Tests

- Tools, each the project's configured tool, else the default: runner and assertions `cargo test` with built-in asserts, mutation `cargo-mutants`, doubles hand-written trait fakes, Gherkin `cucumber` (only for team-facing Gherkin).
- Names: `given_empty_store_when_submitting_thread_then_it_is_saved`.
- Levels: `#[cfg(test)] mod tests` (`cargo test --lib`), then `tests/component`, `tests/integration`, `tests/system`, each run with `cargo test --test <level>`.
- Async tests use the project's runtime (`#[tokio::test]`).
- Bind test servers to port `0`, and abort spawned server tasks or hold drop guards.
