# Dart and Flutter Hexagonal Architecture

Use this as a Dart and Flutter-specific delta on top of the generic Domain, Application, API, and Infrastructure references. It prescribes no state-management, routing, UI or backend package: match the ones the codebase already uses, and treat each as an adapter.

## 1. Package and Module Boundaries

- Use feature-first directory structures with clear layer boundaries:
  - Single package: `lib/src/<feature>/domain/`, `lib/src/<feature>/application/`, `lib/src/<feature>/infrastructure/`, and `lib/src/<feature>/presentation/` (or `api/` for a Dart backend).
  - Multi-package workspace: `packages/<feature>_domain` and `packages/<feature>_application` are pure Dart packages (`sdk: ^3.3.0`) with no Flutter, backend SDK, HTTP or serialization dependency; `packages/<feature>_infrastructure` implements the outbound ports; the Flutter app and any Dart server consume the same domain and application packages as inbound adapters.
- Shared domain primitives belong in a shared domain package only when bounded contexts jointly own the language. Never put application, Flutter, SDK or serialization types there.
- Domain packages never import `flutter`, backend SDKs, HTTP clients, local storage packages or code-generation serialization annotations.

## 2. Aggregate Boundary Files

- Default aggregate file name to the plural repository port: `lib/src/users/domain/users.dart`.
- Keep one aggregate root per boundary file.
- Co-locate creation, sealed outcome types, domain events, value types and the repository port (`abstract interface class Users`) in the aggregate file when they belong exclusively to that aggregate.
- Move large business policies, cross-aggregate processes, or shared language to separate domain files.
- Technology implementations use prefix naming (`FirestoreUsers`, `MemoryUsers`, `SqliteUsers`).

## 3. Domain Modeling Idioms

- Domain models are immutable with `final` fields; behavior returns new aggregate instances together with recorded domain events.
- Model Value Objects as `extension type` or immutable classes with value equality, each with one validating factory constructor.
- Model expected business outcomes and errors as `sealed class` hierarchies (`sealed class ChangeEmailResult`) for exhaustive matching; the domain reports failures as outcomes, not exceptions.
- Domain functions are synchronous and free of IO. Reserve `Future` and `Stream` for ports, adapters and application orchestration.

## 4. Creation, Time, and Randomness

- Simple aggregate creation is a factory constructor or static method on the root (`User.create(...)`).
- Use a dedicated factory class only when creation needs injected collaborators (identity or clock ports, policies).
- Inject pure domain ports (`abstract interface class Clock`, `UserIds`) when time or identity must be deterministic in tests or coordinated externally.

## 5. Application Layer

- Transactions, authorization, idempotency, event dispatch and workflow orchestration live here.
- Use case classes (`ChangeUserEmailUseCase`) load aggregates via domain ports, invoke pure domain methods, persist via domain ports, and dispatch domain events.
- Return explicit `sealed class` results (`Success`, `UserNotFound`) rather than leaking infrastructure exceptions.

## 6. Query Ports and Read Models

- Repository ports (`Users`) serve commands that enforce aggregate invariants.
- Query ports (`UserQueries`) serve read models without loading or mutating aggregates.
- Return use-case-tailored read model objects, not raw database maps or SDK documents.

## 7. Outbound Adapters

- Backend SDKs, databases and HTTP clients are outbound adapters in `infrastructure/` (`lib/src/users/infrastructure/firestore_users.dart`).
- SDK types never leak into Domain or Application; adapters map SDK documents or rows to and from domain entities and value objects explicitly.
- Persistence shape is decoupled from domain shape.

## 8. Presentation Inbound Adapters

- Widgets, state holders and routing live in `presentation/` (or `ui/`) as inbound adapters.
- State holders invoke application use cases, translate user interactions into commands, and expose presentation-ready view state to widgets, using whatever state-management package the codebase already has.
- Widgets render state; they never call domain repositories or SDKs directly.
- Wire concrete adapters to ports at the app composition root (`main.dart` or the project's dependency-injection entry).

## 9. Testing Rules

- Domain tests: `dart test` asserting state transitions and invariants with zero Flutter bindings.
- Application tests: unit tests with in-memory fakes of domain ports (`MemoryUsers`) asserting orchestration, result mapping and event publishing.
- Presentation tests: `package:flutter_test` (`testWidgets`) with use cases stubbed at the presentation boundary.
- Infrastructure tests: adapters run against the backend's local emulator or a real local database.
