# JavaScript and TypeScript Tests

- Tools, each the project's configured tool, else the default: runner and assertions Vitest, mutation StrykerJS, network boundary MSW, doubles hand-written fakes, Gherkin CucumberJS (only when Gherkin is a project contract, behind `test:acceptance`).
- `describe` for Given and When, `it` for Then; return or await the action before asserting.
- Levels by file suffix and script: `*.test.ts` (`test:unit`), `*.component.test.ts(x)` (`test:component`), `*.integration.test.ts` (`test:integration`), `*.system.test.ts` (`test:system`). Use the runner's project support or separate configs when suites need different setup.
- UI: Testing Library queries by role and name, never by class or DOM structure.
