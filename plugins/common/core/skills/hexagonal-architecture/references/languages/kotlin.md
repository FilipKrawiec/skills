# Kotlin

## Layout

- Feature-first packages: `users.domain`, `users.app`, `users.api`, `users.infra`.
- `internal` is module-wide, not package-private: in a single Gradle module enforce layer imports with Konsist or ArchUnit; with several modules, the domain module depends on no other layer or framework module.
- A `platform-domain` module may hold pure technical primitives; it is not a Shared Kernel.
- Name the aggregate file after its port (`users/domain/Users.kt`), one root per file, with its creation, sealed outcomes, events, value types and port when they belong only to it.
- `Users` never extends a generic `Repository<User>`.

## Domain idioms

- Never use `data class` for entities or aggregate roots: `copy`, structural equality and destructuring bypass invariants.
- Use `@JvmInline value class UserId(val value: String)` for IDs and small values.
- Expected failures are `sealed interface` outcomes, not exceptions.
- Nullable types only where absence is domain language.
- Domain functions are not `suspend`; `suspend` belongs to ports, adapters and use cases.
- An optional pure `BaseEntity<ID>` is fine; never make it a universal base carrying policy.

## Creation

- Simple creation is `create` on the root's companion object.
- `UserId.new()` only for local, uncoordinated IDs; inject `UserIds` or `Clock` when deterministic or coordinated.

## Adapters

- Concrete adapters are `internal`; DAOs and mappers file-private, `internal` only when framework wiring must see them.
- A framework DAO sits behind the adapter (`JpaUsers(private val dao: UserDao) : Users`), never as the port.
- API DTOs may carry OpenAPI/JSON/validation annotations; persistence records may carry ORM annotations; the domain carries none.
- Publish externally through after-commit hooks or an outbox.

## Tests

- Domain tests start no framework container; application tests use in-memory ports.
