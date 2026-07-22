# TypeScript Hexagonal Architecture

Use this as a TypeScript-specific delta on top of the generic Domain, Application, API, and Infrastructure references.

## Contents

- [Package and Module Boundaries](#1-package-and-module-boundaries)
- [Aggregate Boundary Files](#2-aggregate-boundary-files)
- [Domain Modeling Idioms](#3-domain-modeling-idioms)
- [Creation, Time, and Randomness](#4-creation-time-and-randomness)
- [Application Layer](#5-application-layer)
- [Query Ports and Read Models](#6-query-ports-and-read-models)
- [API and Infrastructure Models](#7-api-and-infrastructure-models)
- [Adapters, DAOs, and Framework Wiring](#8-adapters-daos-and-framework-wiring)
- [Testing Rules](#9-testing-rules)

## 1. Package and Module Boundaries

- Use feature-first directories nested under `src/` with layer directories: `src/<bounded-context>/domain/`, `src/<bounded-context>/app/`, `src/<bounded-context>/api/`, and `src/<bounded-context>/infra/`. For example, `src/users/domain`.
- Separate reuse by intent. A `src/shared/domain` directory contains shared domain primitives (e.g., base Domain Event types or common Value Objects) only when named contexts jointly own them. Do not place application, API, database, or serialization types there.
- Domain directories must not import from `app`, `api`, `infra`, web frameworks (Express, NestJS), database ORMs (Prisma, TypeORM, Mongoose), or serialization/validation libraries (like Class-Transformer or Zod).
- Since TypeScript has no native package-private visibility, enforce boundaries with tooling such as [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser), ESLint import restrictions (e.g., `eslint-plugin-import` path rules), or monorepo workspace packages (e.g., `pnpm-workspace.yaml`).
- If the project uses a monorepo structure, the `@project/users-domain` package must have no dependencies on app, api, infra, or framework packages.

## 2. Aggregate Boundary Files

- Default aggregate file name to the plural repository port when the file stays readable: `src/users/domain/users.ts`.
- Keep one aggregate root type/interface per boundary file.
- Co-locate aggregate-local creation functions, union outcomes/errors, events, value types, and the repository port interface in the aggregate file when they belong exclusively to that aggregate context.
- Move large business policies, cross-aggregate processes, or shared language to separate files/directories.

Example:

```typescript
// src/users/domain/users.ts
import { DomainEvent } from "platform/domain";

// Value types modeled as Branded Types to prevent primitive swapping
export type UserId = string & { readonly __brand: unique symbol };
export type EmailAddress = string & { readonly __brand: unique symbol };

export interface User {
  readonly id: UserId;
  readonly email: EmailAddress;
}

// Pure factory functions for value types
export const createUserId = (value: string): UserId => value as UserId;

export const createEmailAddress = (value: string): EmailAddress => {
  if (!value.includes("@")) {
    throw new Error("Invalid email format");
  }
  return value as EmailAddress;
};

// Pure factory for the Aggregate Root
export const createUser = (email: EmailAddress): User => ({
  id: createUserId(crypto.randomUUID()),
  email,
});

// Pure state transition function
export const changeUserEmail = (user: User, newEmail: EmailAddress): ChangeUserEmailOutcome => {
  if (user.email === newEmail) {
    return { type: "Unchanged" };
  }
  
  const updatedUser: User = { ...user, email: newEmail };
  const event: UserEmailChanged = {
    occurredAt: new Date(),
    userId: user.id,
    email: newEmail,
  };

  return {
    type: "Changed",
    user: updatedUser,
    event,
  };
};

export interface Users {
  get(id: UserId): Promise<User | null>;
  save(user: User): Promise<void>;
}

export type ChangeUserEmailOutcome =
  | { type: "Unchanged" }
  | { type: "Changed"; user: User; event: UserEmailChanged };

export interface UserEmailChanged extends DomainEvent {
  readonly occurredAt: Date;
  readonly userId: UserId;
  readonly email: EmailAddress;
}
```

`Users` is the repository port interface. Technology-specific implementations use prefixes/suffixes such as `PrismaUsers` or `TypeOrmUsers`.

## 3. Domain Modeling Idioms

- Domain models must use read-only interfaces or types (e.g., `readonly` modifier or `Readonly<T>`) to guarantee immutability.
- Do not use classes for mutable Entities or Aggregate Roots. Use pure data-oriented interfaces.
- Protect domain invariants using pure functions that accept the current state and parameters, then return a new state representation along with any generated domain events.
- Use branded/opaque types (e.g. `type UserId = string & { readonly __brand: unique symbol }`) for identity and small value types to prevent passing wrong strings.
- Model expected business failures as discriminated union outcomes/errors (e.g., using `type` tags like `"Unchanged" | "Changed" | "InvalidEmail"`), not throwing exceptions.
- Domain functions should be synchronous and free of IO. Do not return `Promise` values from domain logic functions.

## 4. Creation, Time, and Randomness

- Aggregate creation should live in the aggregate file as a pure function prefixing the aggregate name (e.g. `createUser(...)`).
- Keep creation logic simple and direct. Avoid creating separate factory helper functions or clock/identity injection interfaces unless explicitly required by external integration constraints.
- For timestamps, use standard language primitives like `new Date()` directly within the creation context rather than introducing helper abstractions.
- For random ID generation, use the native `crypto.randomUUID()` directly.

## 5. Application Layer

- Maintain transactions, authorization, domain event dispatch, and application orchestrations in this layer.
- Use case functions load data via ports, execute pure domain state transition functions, save updated states back through ports, and publish resulting domain events.
- Return explicit application results using union types for expected failures; do not throw or let database exceptions leak up.

Example:

```typescript
// src/users/app/change-user-email.ts
import { Users, UserId, EmailAddress, UserEmailChanged, changeUserEmail, createEmailAddress } from "../domain/users";

export interface ChangeUserEmailCommand {
  readonly userId: string;
  readonly email: string;
}

export type ChangeUserEmailResult =
  | { readonly type: "Success" }
  | { readonly type: "UserNotFound" }
  | { readonly type: "Unchanged" };

export interface UserEventPublisher {
  publish(event: UserEmailChanged): Promise<void>;
}

export interface ChangeUserEmailDeps {
  readonly users: Users;
  readonly events: UserEventPublisher;
}

export const changeUserEmailUseCase = async (
  deps: ChangeUserEmailDeps,
  command: ChangeUserEmailCommand
): Promise<ChangeUserEmailResult> => {
  const user = await deps.users.get(command.userId as UserId);
  if (!user) {
    return { type: "UserNotFound" };
  }

  const email = createEmailAddress(command.email);
  const outcome = changeUserEmail(user, email);

  if (outcome.type === "Changed") {
    await deps.users.save(outcome.user);
    await deps.events.publish(outcome.event);
    return { type: "Success" };
  }

  return { type: "Unchanged" };
};
```

## 6. Query Ports and Read Models

- Use repository ports for write models and commands that need aggregate invariants.
- Use query ports for read models that should not load or mutate aggregates.
- Name domain-owned query ports with the `Queries` suffix (e.g., `UserQueries`).
- Return read models shaped for the specific use case, not raw ORM entities and not API DTOs.

```typescript
// src/users/domain/user-queries.ts
import { UserId, EmailAddress } from "./users";

export interface UserProfile {
  readonly id: UserId;
  readonly email: EmailAddress;
}

export interface UserQueries {
  profile(id: UserId): Promise<UserProfile | null>;
}
```

## 7. API and Infrastructure Models

- API packages own request and response DTO types. Validations can be done using schema libraries (e.g., `zod` types or runtime parsers).
- Infrastructure packages own persistence structures (type definitions matching DB schema, TypeORM `@Entity` metadata, Prisma types), database clients, and mappers.
- Never expose Domain types as API DTOs, and never pass ORM-mapped records inward to the Application or Domain layers.
- Persistence shape is not expected to be 1:1 with Domain shape.

```typescript
// src/users/api/user-dtos.ts
import { z } from "zod";

export const ChangeUserEmailRequestSchema = z.object({
  email: z.string().email(),
});

export type ChangeUserEmailRequest = z.infer<typeof ChangeUserEmailRequestSchema>;
```

```typescript
// src/users/infra/user-record.ts
export interface UserRecord {
  readonly id: string;
  readonly email_address: string;
  readonly updated_at: Date;
}
```

## 8. Adapters, DAOs, and Framework Wiring

- Concrete adapters implementation (functions or classes) are internal to the infrastructure layer; domain/application ports remain public.
- Helper functions and schema definitions should not be exported outside their infra file or directory.
- Match the host framework already used by the codebase (e.g. Express, Fastify, NestJS, Awilix).
- Put framework wiring/injection configuration in composition roots, not in Domain or Application.

Example (Prisma Repository implementation):

```typescript
// src/users/infra/prisma-users.ts
import { Users, User, UserId, createUserId, createEmailAddress } from "../domain/users";
import { PrismaClient } from "@prisma/client";

export class PrismaUsers implements Users {
  constructor(private readonly prisma: PrismaClient) {}

  public async get(id: UserId): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  public async save(user: User): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: user.id },
      update: { email_address: user.email },
      create: { id: user.id, email_address: user.email },
    });
  }

  private toDomain(record: { id: string; email_address: string }): User {
    return {
      id: createUserId(record.id),
      email: createEmailAddress(record.email_address),
    };
  }
}
```

## 9. Testing Rules

- Domain tests import pure model creators and transition functions and assert changes. They must not load or boot a framework container.
- Application tests use stubbed or mock objects (e.g. simple inline object implementations) for outbound ports to assert coordination, result mapping, and event dispatch.
- API tests verify routing, serialization, validation, status codes, and DTO mappings without asserting internal domain rules.
- Infrastructure tests verify query mappings, schema validations, migrations, and database adapter behavior using real databases (e.g., using localized instances or Testcontainers).
