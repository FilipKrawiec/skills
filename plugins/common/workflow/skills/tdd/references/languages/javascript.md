# JavaScript And TypeScript Test Guidelines

## Default Stack

- Runner: Vitest for Vite/modern TS projects; Jest when the project already standardizes on it.
- Assertions: built-in `expect`; add `@testing-library/jest-dom` for DOM matchers.
- Mocks: `vi.fn`, `vi.spyOn`, and `vi.mock` for Vitest; Jest equivalents in Jest projects.
- Acceptance: CucumberJS only when Gherkin is a project contract; otherwise keep acceptance tests in the runner.

## Scenario Shape

- Use `describe` blocks for `Given` and `When`; use `it` for `Then`.
- Prefer user-observable assertions over implementation details.
- Mock outbound ports and network boundaries; use MSW for browser/API request behavior where practical.
- Keep async tests explicit: return/await the action that triggers the assertion.

## Component, UI, And Acceptance Tests

- Use runner-level projects or package scripts as the source-set equivalent:
  - `*.test.ts` or `*.spec.ts` via `test:unit` for fast unit tests.
  - `*.component.test.ts(x)` via `test:component` for rendered UI or booted in-process components.
  - `*.integration.test.ts` via `test:integration` for adapters, network boundaries, or real infrastructure.
  - `*.system.test.ts` via `test:system` for black-box deployed-service checks.
- Use Testing Library for UI behavior: query by role/name and assert what a user can observe.
- In Vitest, prefer `projects` or separate config files when suites need different setup, timeouts, browsers, or environment variables.
- Use Testcontainers only for integration/system boundaries that need real infrastructure.
- Keep CucumberJS behind a dedicated script such as `test:acceptance` when Gherkin is part of the product contract.
