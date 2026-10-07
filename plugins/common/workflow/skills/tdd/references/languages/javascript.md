# JavaScript and TypeScript Tests

- Stack: Vitest (Jest where the project already uses it), built-in `expect` plus `@testing-library/jest-dom`, StrykerJS for mutation, MSW for network boundaries, CucumberJS only when Gherkin is a project contract (behind `test:acceptance`).
- `describe` for Given and When, `it` for Then; return or await the action before asserting.
- Levels by file suffix and script: `*.test.ts` (`test:unit`), `*.component.test.ts(x)` (`test:component`), `*.integration.test.ts` (`test:integration`), `*.system.test.ts` (`test:system`). Use Vitest `projects` or separate configs when suites need different setup.
- UI: Testing Library queries by role and name, never by class or DOM structure.
