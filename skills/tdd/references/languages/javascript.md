# JavaScript / TypeScript Testing Library & Pattern Guidelines

## Core Stack
- **Executor:** Jest / Vitest
- **Mocker:** Jest / Vitest (native module and spy mocks)
- **Acceptance (BDD Tools):** CucumberJS (`@cucumber/cucumber`)
- **Assertions:** Jest / Vitest (native `expect` assertions)

## 1. Unit Testing
- Structure unit tests natively using BDD structure (nested blocks styled as Given-When-Then):
  ```typescript
  import { vi, describe, it, expect } from 'vitest'; // Or Jest equivalent imports
  import { SubmitThread } from './submit-thread';

  describe('Given an empty thread store', () => {
    describe('When a user submits a thread', () => {
      it('Then it is saved to the repository', async () => {
        // Arrange: Repo is an outbound boundary port interface, permitting mocking under Chicago School rules.
        const repo = { save: vi.fn().mockResolvedValue(undefined) };
        const useCase = new SubmitThread(repo);

        // Act
        await useCase.execute('JS Title');

        // Assert
        expect(repo.save).toHaveBeenCalledWith('JS Title');
      });
    });
  });
  ```

## 2. Component Testing
- Programmatic port binding and Testcontainers postgres setup:
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
  import { bootServer, AppServer } from './server';
  import axios from 'axios';

  describe('Server Component Test', () => {
    let container: StartedTestContainer;
    let server: AppServer;

    beforeAll(async () => {
      container = await new GenericContainer('postgres:16-alpine')
        .withEnvironment({ POSTGRES_PASSWORD: 'password' })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
        .start();

      server = await bootServer({
        port: 0,
        dbUrl: `postgresql://postgres:password@${container.getHost()}:${container.getMappedPort(5432)}/postgres`
      });
    });

    afterAll(async () => {
      if (server) {
        await server.close();
      }
      if (container) {
        await container.stop();
      }
    });

    it('creates a new thread', async () => {
      const response = await axios.post(`http://localhost:${server.port}/threads`, { title: 'JS Component' });
      expect(response.status).toBe(200);
    });
  });
  ```

## 3. UI Component Testing (Widgets & Views)
- Render UI components in-memory (e.g. `submit-button.test.tsx`) using React Testing Library and verify layouts:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { SubmitButton } from './submit-button';

  // Note: expect(...).toBeInTheDocument() requires importing @testing-library/jest-dom/vitest or setup configuration
  describe('SubmitButton Component', () => {
    it('renders with correct text label', () => {
      // Arrange & Act
      render(<SubmitButton label="Submit" />);

      // Assert
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });
  });
  ```

## 4. Acceptance Testing
- **Tag-Based Grouping:** Group acceptance tests using folder naming (e.g. `*.acceptance.test.ts`) or CucumberJS feature tags (`@acceptance`):
  - `vitest run` (Runs the developer unit/component tests, ignoring acceptance files if excluded in config)
  - `vitest run "**/*.acceptance.test.ts"` (Runs vitest-based acceptance tests via positional pattern)
  - `npx cucumber-js --tags "@acceptance"` (Runs CucumberJS acceptance feature specs)
- **Step Definition Example:**
  ```typescript
  import { When } from '@cucumber/cucumber';

  // Annotate parameter type to satisfy strict TypeScript compiler checks
  When('a user submits a thread titled {string}', async function (title: string) {
    // Step definition implementation executing against API, HTTP client or memory context
  });
  ```
