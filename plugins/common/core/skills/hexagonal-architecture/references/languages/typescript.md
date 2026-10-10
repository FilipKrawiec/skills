# TypeScript

## Layout

- `src/<context>/{domain,app,api,infra}/`; in a monorepo, `@project/<context>-domain` depends on no app, api, infra or framework package.
- Enforce imports with dependency-cruiser or ESLint import-path rules.
- Domain imports no ORM, web framework, or validation/serialization library (Zod included).
- Name the aggregate file after its port (`src/users/domain/users.ts`), holding its creation function, union outcomes, events, value types and `interface Users` when they belong only to it.

## Domain idioms

- No classes for entities or aggregates: `readonly` types plus pure functions that take state and return the new state and events.
- Branded types for IDs and small values (`type UserId = string & { readonly __brand: unique symbol }`); one parser (`userId(raw)`) is the only place the brand is applied.
- Expected failures are discriminated unions (`{ type: "Unchanged" } | { type: "Changed"; user: User; event: UserEmailChanged }`), never throws.
- Domain functions never return a `Promise`.
- Creation is a pure `createUser(...)` in the aggregate file. Without `Clock`/`UserIds` ports, the use case passes `new Date()` and `crypto.randomUUID()` in.

## Application and adapters

- Use cases return union results (`{ type: "Success" } | { type: "UserNotFound" }`); catch database errors in the adapter.
- Don't export adapter helpers or schemas outside their `infra` directory; only ports are public.
- DI decorators are allowed in use cases when the codebase uses them, never in the domain.

## Tests

- Domain tests import pure functions and boot no container.
