# TypeScript Hexagonal Architecture

Use this as a TypeScript-specific delta on top of the generic Domain, Application, API, and Infrastructure references.

## 1. Package and Module Boundaries

- Use feature-first directories nested under `src/` with layer directories: `src/<bounded-context>/domain/`, `src/<bounded-context>/app/`, `src/<bounded-context>/api/`, and `src/<bounded-context>/infra/` (e.g., `src/users/domain`).
- Separate reuse by intent. A `src/shared/domain` directory contains shared domain primitives (e.g., base Domain Event types or common Value Objects) only when named contexts jointly own them. Do not place application, API, database, or serialization types there.
- Domain directories must not import from `app`, `api`, `infra`, web frameworks (Express, NestJS), database ORMs (Prisma, TypeORM, Mongoose), or serialization/validation libraries (like Class-Transformer or Zod).
- Enforce boundaries with tooling such as [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser), ESLint import restrictions (e.g., `eslint-plugin-import` path rules), or monorepo workspace packages (e.g., `pnpm-workspace.yaml`).
- If the project uses a monorepo structure, the `@project/users-domain` package must have no dependencies on app, api, infra, or framework packages.

## 2. Aggregate Boundary Files

- Default aggregate file name to the plural repository port when the file stays readable: `src/users/domain/users.ts`.
- Keep one aggregate root type/interface per boundary file.
- Co-locate aggregate-local creation functions, union outcomes/errors, events, value types, and the repository port interface (`Users`) in the aggregate file when they belong exclusively to that aggregate context.
- Move large business policies, cross-aggregate processes, or shared language to separate files/directories.
- `Users` is the repository port interface. Technology-specific implementations use prefixes/suffixes such as `PrismaUsers` or `TypeOrmUsers`.

## 3. Domain Modeling Idioms

- Domain models must use read-only interfaces or types (e.g., `readonly` modifier or `Readonly<T>`) to guarantee immutability.
- Do not use classes for mutable Entities or Aggregate Roots. Use pure data-oriented interfaces.
- Protect domain invariants using pure functions that accept the current state and parameters, then return a new state representation along with any generated domain events.
- Use branded/opaque types (`type UserId = string & { readonly __brand: unique symbol }`) for identity and small value types to prevent primitive obsession and swapping.
- Model expected business failures as discriminated union outcomes/errors (e.g., `type Outcome = { type: "Unchanged" } | { type: "Changed"; user: User; event: UserEmailChanged }`), not throwing exceptions.
- Domain functions should be synchronous and free of IO. Do not return `Promise` values from domain logic functions.

## 4. Creation, Time, and Randomness

- Aggregate creation should live in the aggregate file as a pure function prefixing the aggregate name (e.g., `createUser(...)`).
- Keep creation logic simple and direct. Avoid creating separate factory helper functions or clock/identity injection interfaces unless explicitly required by external integration constraints.
- For timestamps, use standard language primitives like `new Date()` directly within the creation context rather than introducing helper abstractions.
- For random ID generation, use native `crypto.randomUUID()` directly.

## 5. Application Layer

- Maintain transactions, authorization, domain event dispatch, and application orchestrations in this layer.
- Use case functions load data via ports, execute pure domain state transition functions, save updated states back through ports, and publish resulting domain events.
- Return explicit application results using union types (e.g., `{ type: "Success" } | { type: "UserNotFound" } | { type: "Unchanged" }`) for expected failures; do not throw or let database exceptions leak up.

## 6. Query Ports and Read Models

- Use repository ports for write models and commands that need aggregate invariants.
- Use query ports for read models that should not load or mutate aggregates.
- Name domain-owned query ports with the `Queries` suffix (e.g., `UserQueries`).
- Return read models shaped for the specific use case, not raw ORM entities and not API DTOs.

## 7. API and Infrastructure Models

- API packages own request and response DTO types. Validations can be done using schema libraries (e.g., `zod` types or runtime parsers).
- Infrastructure packages own persistence structures (type definitions matching DB schema, TypeORM `@Entity` metadata, Prisma types), database clients, and mappers.
- Never expose Domain types as API DTOs, and never pass ORM-mapped records inward to the Application or Domain layers.
- Persistence shape is not expected to be 1:1 with Domain shape.

## 8. Adapters, DAOs, and Framework Wiring

- Concrete adapter implementations (functions or classes) are internal to the infrastructure layer; domain/application ports remain public.
- Helper functions and schema definitions should not be exported outside their infra file or directory.
- Match the host framework already used by the codebase (e.g., Express, Fastify, NestJS, Awilix).
- Put framework wiring/injection configuration in composition roots, not in Domain or Application.

## 9. Testing Rules

- Domain tests import pure model creators and transition functions and assert changes. They must not load or boot a framework container.
- Application tests use stubbed or mock objects for outbound ports to assert coordination, result mapping, and event dispatch.
- API tests verify routing, serialization, validation, status codes, and DTO mappings without asserting internal domain rules.
- Infrastructure tests verify query mappings, schema validations, migrations, and database adapter behavior using real databases (e.g., using localized instances or Testcontainers).
