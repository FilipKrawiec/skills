# Kotlin Hexagonal Architecture

Use this as a Kotlin-specific delta on top of the generic Domain, Application, API, and Infrastructure references.

## 1. Package and Module Boundaries

- Use feature-first packages with layer suffixes: `users.domain`, `users.app`, `users.api`, `users.infra`.
- Keep shared domain primitives in sibling kernel packages such as `kernel.domain`.
- Domain packages must not depend on `app`, `api`, `infra`, web frameworks, JPA, serialization, or database libraries.
- Kotlin `internal` is module-wide, not package-private. In a single Gradle module, enforce boundaries with architecture tests such as Konsist, ArchUnit, or project-specific import rules.
- If the project has multiple Gradle modules, Domain must not depend on Application, API, Infrastructure, or framework modules.

## 2. Aggregate Boundary Files

- Default Kotlin aggregate file name to the plural repository port when the file stays readable: `users/domain/Users.kt`.
- Keep one aggregate root per boundary file.
- Co-locate aggregate-local creation logic, sealed outcomes/errors, events, value types, and repository port when they belong only to that aggregate.
- Move large policies, cross-aggregate concepts, or shared language out to separate files/packages.

Example:

```kotlin
// users/domain/Users.kt
package users.domain

import kernel.domain.BaseEntity
import kernel.domain.DomainEvent

class User(
    override val id: UserId,
    email: EmailAddress,
) : BaseEntity<UserId>(id) {
    var email: EmailAddress = email
        private set

    fun changeEmail(newEmail: EmailAddress): ChangeUserEmailOutcome =
        if (newEmail == email) {
            ChangeUserEmailOutcome.Unchanged
        } else {
            email = newEmail
            ChangeUserEmailOutcome.Changed(UserEmailChanged(id, newEmail))
        }

    companion object {
        fun create(email: EmailAddress): User =
            User(
                id = UserId.new(),
                email = email,
            )
    }
}

interface Users {
    fun get(id: UserId): User?
    fun save(user: User)
}

sealed interface ChangeUserEmailOutcome {
    data object Unchanged : ChangeUserEmailOutcome
    data class Changed(val event: UserEmailChanged) : ChangeUserEmailOutcome
}

data class UserEmailChanged(
    val userId: UserId,
    val email: EmailAddress,
) : DomainEvent

@JvmInline
value class UserId(val value: String) {
    companion object {
        fun new(): UserId =
            UserId(java.util.UUID.randomUUID().toString())
    }
}

@JvmInline
value class EmailAddress(val value: String)
```

`Users` is the domain repository port interface. It is not a concrete adapter and should not extend a generic `Repository<User>` abstraction. Kotlin implementations use idiomatic technology prefixes such as `JpaUsers`, `ExposedUsers`, or `JdbcUsers`.

## 3. Domain Modeling Idioms

- Aggregate Roots and Entities should extend `kernel.domain.BaseEntity<ID>`, a domain-owned kernel type that implements identity-based equality.
- Do not use Kotlin `data class` for mutable Entities or Aggregate Roots; generated `copy`, structural equality, and destructuring can bypass invariants.
- Use Kotlin value classes for small identity and value types when they preserve domain meaning.
- Model expected business failures as sealed domain errors or sealed domain outcomes, not framework exceptions.
- Use nullable types only when absence is part of the domain language; otherwise enforce construction through value objects, factories, or aggregate methods.
- Domain methods should usually be synchronous and free of IO. Put `suspend` on application, port, or adapter functions only when IO requires it.

## 4. Creation, Time, and Randomness

- Put simple aggregate creation logic on the Aggregate Root companion object as a `create` method.
- Use a separate aggregate factory only when creation needs injected collaborators, external components, clocks, randomness, or domain ports.
- Separate factories should usually expose a single `create` method.
- `UserId.new()` is acceptable only for local, pure, uncoordinated ID generation.
- Use injected ports such as `UserIds` or `Clock` when IDs or time are sequential, tenant-aware, externally coordinated, database-issued, or need deterministic tests.

Example:

```kotlin
// users/domain/Users.kt
package users.domain

class UserFactory(
    private val userIds: UserIds,
) {
    fun create(email: EmailAddress): User =
        User(
            id = userIds.next(),
            email = email,
        )
}

interface UserIds {
    fun next(): UserId
}
```

## 5. Application Layer

- Keep transactions, authorization, idempotency, domain event dispatch, and application workflow in this layer.
- Load aggregates, call domain methods, save through domain ports, then dispatch typed domain events after state is saved.
- For external publication reliability, use after-commit hooks or a transactional outbox instead of publishing directly from inside aggregates.
- Return explicit application results for expected failures; do not silently return on missing aggregates.

Example:

```kotlin
// users/app/ChangeUserEmail.kt
package users.app

import kernel.domain.DomainEvents
import users.domain.ChangeUserEmailOutcome
import users.domain.EmailAddress
import users.domain.UserId
import users.domain.Users

data class ChangeUserEmailCommand(
    val userId: String,
    val email: String,
)

sealed interface ChangeUserEmailResult {
    data object UserNotFound : ChangeUserEmailResult
    data object Unchanged : ChangeUserEmailResult
    data object Changed : ChangeUserEmailResult
}

class ChangeUserEmail(
    private val users: Users,
    private val events: DomainEvents,
) {
    fun handle(command: ChangeUserEmailCommand): ChangeUserEmailResult {
        val user = users.get(UserId(command.userId))
            ?: return ChangeUserEmailResult.UserNotFound

        return when (val outcome = user.changeEmail(EmailAddress(command.email))) {
            is ChangeUserEmailOutcome.Changed -> {
                users.save(user)
                events.publish(outcome.event)
                ChangeUserEmailResult.Changed
            }
            ChangeUserEmailOutcome.Unchanged -> ChangeUserEmailResult.Unchanged
        }
    }
}
```

## 6. Query Ports and Read Models

- Use aggregate repositories for commands that need aggregate invariants.
- Use query ports for read models that should not load or mutate aggregates.
- Name domain-owned query ports with the `Queries` suffix.
- Return read models shaped for the use case, not ORM entities and not API DTOs.

```kotlin
// users/domain/UserQueries.kt
package users.domain

interface UserQueries {
    fun profile(id: UserId): UserProfile?
}

data class UserProfile(
    val id: UserId,
    val email: EmailAddress,
)
```

## 7. API and Infrastructure Models

- API packages own request and response DTOs. DTOs may carry OpenAPI, JSON, validation, or serialization annotations.
- Infrastructure packages own persistence records, DAOs, mappers, and external client models. Persistence records may carry JPA or ORM annotations.
- Never expose Domain models as API DTOs, and never pass ORM entities inward.
- Persistence shape is not expected to be 1:1 with Domain shape.

```kotlin
// users/api/UserDtos.kt
package users.api

import com.fasterxml.jackson.annotation.JsonProperty
import io.swagger.v3.oas.annotations.media.Schema
import users.app.ChangeUserEmailCommand

@Schema(name = "ChangeUserEmailRequest")
data class ChangeUserEmailRequest(
    @field:Schema(example = "user@example.com")
    @JsonProperty("email")
    val email: String,
) {
    fun toCommand(userId: String): ChangeUserEmailCommand =
        ChangeUserEmailCommand(userId = userId, email = email)
}
```

```kotlin
// users/infra/UserRecord.kt
package users.infra

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table

@Entity
@Table(name = "users")
internal class UserRecord(
    @Id
    @Column(name = "id")
    var id: String,

    @Column(name = "email_address")
    var emailAddress: String,
)
```

## 8. Adapters, DAOs, and Framework Wiring

- Concrete adapters are usually `internal`; domain/application ports remain public.
- DAOs and mapper helpers should be file-private when possible.
- Make helper types `internal` only when framework wiring must reference them from a visible factory method.
- Match the host framework already used by the codebase; do not introduce Spring, Quarkus, Ktor, or another framework because of this reference.
- Put framework wiring in composition root/configuration code, not in Domain.

Spring/JPA note: if the existing codebase already uses Spring Data, a Spring-specific DAO can implement the same adapter boundary. Treat this as explanatory only.

```kotlin
// users/infra/JpaUsers.kt
package users.infra

import org.springframework.data.jpa.repository.JpaRepository
import users.domain.EmailAddress
import users.domain.User
import users.domain.UserId
import users.domain.Users

internal class JpaUsers(
    private val dao: SpringDataUserDao,
) : Users {
    override fun get(id: UserId): User? =
        dao.findById(id.value).orElse(null)?.toDomain()

    override fun save(user: User) {
        dao.save(user.toRecord())
    }
}

internal interface SpringDataUserDao : JpaRepository<UserRecord, String>

private fun UserRecord.toDomain(): User =
    User(
        id = UserId(id),
        email = EmailAddress(emailAddress),
    )

private fun User.toRecord(): UserRecord =
    UserRecord(
        id = id.value,
        emailAddress = email.value,
    )
```

## 9. Testing Rules

- Domain tests instantiate aggregates and value objects directly; they should not start a framework container.
- Application tests use fake or in-memory ports and assert orchestration, transaction boundaries, result mapping, and domain event dispatch.
- API tests verify routing, serialization, validation, DTO mapping, and status codes without asserting domain internals.
- Infrastructure tests verify mapping, annotations, queries, migrations, and adapter behavior with the real persistence stack or Testcontainers when risk justifies it.
- Add architecture tests to enforce imports when package or module boundaries are not enforced by Gradle modules.
