# Dart and Flutter Hexagonal Architecture

Use this as a Dart and Flutter-specific delta on top of the generic Domain, Application, API, and Infrastructure references.

## 1. Package and Module Boundaries

- Use feature-first directory structures with clear layer boundaries:
  - In a single-package project: `lib/src/<feature>/domain/`, `lib/src/<feature>/application/`, `lib/src/<feature>/infrastructure/`, and `lib/src/<feature>/presentation/` (or `api/` for Dart backend).
  - In a multi-package workspace (using Dart workspaces or Melos):
    - `packages/<feature>_domain`: Pure Dart package (`sdk: ^3.0.0`), zero dependencies on Flutter SDK, Firebase, HTTP clients, or serialization frameworks.
    - `packages/<feature>_application`: Pure Dart package depending only on `_domain`.
    - `packages/<feature>_infrastructure` (or technology-specific adapters like `packages/<feature>_firebase`): Implements domain outbound ports using Firebase or database drivers.
    - `packages/<feature>_flutter_ui` (or `app/`): Flutter package providing widgets and Riverpod state presentation (inbound adapter).
    - `packages/<feature>_server` (or `server/`): Dart backend service (e.g. Dart Frog, Shelf) consuming the exact same `_domain` and `_application` packages.
- Shared domain primitives (e.g., base Value Objects, IDs) belong in a shared domain package/directory only when bounded contexts jointly own the language. Never put application, Flutter, Firebase, or serialization types in shared domain.
- Domain packages must never import `flutter`, `firebase_*`, `cloud_firestore`, `http`, `dio`, `shared_preferences`, or code-generation serialization annotations.

## 2. Aggregate Boundary Files

- Default aggregate file name to the plural repository port: `lib/src/users/domain/users.dart`.
- Keep one aggregate root per boundary file.
- Co-locate aggregate creation methods, sealed outcome types, domain events, value types, and the repository port interface (`Users`) in the aggregate file when they belong exclusively to that aggregate.
- Move large business policies, cross-aggregate processes, or shared language to separate domain files.
- `Users` is the domain repository port interface (`abstract interface class Users`). Technology implementations use prefix naming (e.g. `FirestoreUsers`, `MemoryUsers`, `SqliteUsers`).

## 3. Domain Modeling Idioms

- Domain models must be immutable with `final` fields.
- Avoid mutable classes for Entities or Aggregate Roots. Provide behavior through methods returning new aggregate instances along with recorded domain events.
- Model Value Objects using `extension type` (for zero-cost type safety over primitive types) or immutable classes with value equality (`operator ==` and `hashCode`).
- Model expected business outcomes and errors as `sealed class` hierarchies (e.g. `sealed class ChangeEmailResult`, `sealed class UserError`), enabling exhaustive pattern matching in callers.
- Domain functions and methods must be synchronous and free of IO. Reserve `Future` and `Stream` for ports, adapters, and asynchronous application orchestration.

## 4. Creation, Time, and Randomness

- Simple aggregate creation should use factory constructors (e.g. `User.create(...)`) or static methods on the aggregate root.
- Use a dedicated `AggregateFactory` class only when creation requires complex invariant resolution, collaborator checks, or injected ID/clock ports.
- For non-deterministic inputs (like clocks, secure random IDs, or external sequence generators), inject pure domain port interfaces (e.g. `abstract interface class Clock`, `abstract interface class UserIds`).

## 5. Application Layer

- Maintain transactions, authorization checks, idempotency, event dispatch, and workflow orchestration in this layer.
- Use case classes (e.g. `ChangeUserEmailUseCase`) load aggregates via domain ports, invoke pure domain methods, persist state via domain ports, and dispatch domain events.
- Return explicit `sealed class` result types (e.g. `sealed class ChangeUserEmailOutcome { final class Success ...; final class UserNotFound ...; }`) to avoid leaking unhandled infrastructure exceptions.

## 6. Query Ports and Read Models

- Use repository ports (`Users`) for write models and commands that enforce aggregate invariants.
- Use query ports (`UserQueries`) for read models and queries that do not load or mutate full aggregates.
- Return use-case-tailored Read Model data objects, not raw database maps or ORM documents.

## 7. Firebase and Infrastructure Outbound Adapters

- Firebase is strictly an outbound adapter residing in `infrastructure/` (e.g. `lib/src/users/infrastructure/firestore_users.dart`).
- Firebase SDK types (`DocumentSnapshot`, `QuerySnapshot`, `UserCredential`, `FirebaseFirestore`) must never leak into Domain or Application layers.
- Outbound adapters must explicitly map Firebase documents (`Map<String, dynamic>`) to/from Domain Entities and Value Objects.
- Persistence data shapes in Firestore or databases are decoupled from Domain models.
- For SDK-specific Firebase implementation recipes and emulator setups, agents may consult `google/skills` (`firebase`, `firestore`) if installed in the workspace.

## 8. Flutter, Riverpod, and Routing Inbound Adapters

- Flutter UI widgets, Riverpod state notifiers, and routing reside in `presentation/` (or `ui/`) as inbound adapters.
- **State Management**: Use `Riverpod` (`Notifier` or `AsyncNotifier` via `@riverpod` code generation). Notifiers invoke Application Use Cases, translate user interactions into command parameters, and expose presentation-ready View Models / `AsyncValue<State>` to Flutter widgets.
- **Routing**: Use `go_router` with type-safe route definitions (`go_router_builder`). Route guards and redirects reactively observe Riverpod auth/session state.
- **UI & Design System**: Standardize on **Material 3** (`material_ui: ^1.0.0` or Flutter Material 3). Use `ColorScheme.fromSeed` and platform-adaptive constructors (`.adaptive`) for cross-platform fidelity (iOS, Android, Web, Desktop), layered with custom glass/blur surface components (`BackdropFilter` / Impeller).
- **UI & Presentation Boundaries**: Widgets observe Riverpod providers and render state; widgets never call domain repositories or Firebase directly.
- **Official Flutter & Dart Skills**: For low-level widget lifecycle patterns or Dart static analysis fixes, agents may consult `flutter/agent-plugins` and `dart-lang/skills` if present in the environment.
- Wire dependency injection / Provider overrides at the app composition root (`main.dart` or `ProviderScope`), configuring concrete infrastructure adapters for domain ports.

## 9. Testing Rules

- Domain tests: Pure `dart test` asserting state transitions and invariants with zero Flutter bindings or framework setup.
- Application tests: Unit tests using fake/in-memory implementations of domain ports (`MemoryUsers`) to assert orchestration, result mapping, and event publishing.
- Inbound adapter / Presentation tests: Use `package:flutter_test` (`testWidgets`) with Riverpod provider overrides to assert UI behavior and state binding.
- Infrastructure adapter tests: Test Firestore/Firebase adapters against the Firebase Local Emulator Suite.

## 10. Scaffolding & Canonical Dependency Meta

When scaffolding new packages or modules, enforce this deterministic dependency matrix:

| Layer / Role | Canonical Packages (`dependencies`) | Tooling & Codegen (`dev_dependencies`) | Constraints |
|---|---|---|---|
| **Domain** | *(None or `meta: ^1.12.0` for `@immutable`)* | `test: ^1.25.0`, `lints: ^5.0.0` | Pure Dart `sdk: ^3.0.0`. Zero Flutter, Firebase, or IO imports. |
| **Application** | *(Domain package reference)* | `test: ^1.25.0`, `lints: ^5.0.0` | Pure Dart. Depends only on Domain. |
| **Flutter UI (Inbound)** | `material_ui: ^1.0.0`<br>`flutter_riverpod: ^2.6.0`<br>`riverpod_annotation: ^2.6.0`<br>`go_router: ^14.8.0` | `flutter_test` (SDK)<br>`riverpod_generator: ^2.6.0`<br>`go_router_builder: ^2.8.0`<br>`build_runner: ^2.4.0`<br>`flutter_lints: ^5.0.0` | Imports Application & Domain. Standardizes on Material 3. Never calls Firebase directly. |
| **Firebase (Outbound)** | `firebase_core: ^3.12.0`<br>`cloud_firestore: ^5.6.0`<br>`firebase_auth: ^5.5.0`<br>`firebase_storage: ^12.4.0` | `test: ^1.25.0`, `lints: ^5.0.0` | Implements Domain ports in `infrastructure/`. SDK types stay internal. |
| **Dart Backend (Inbound)** | `dart_frog: ^1.2.0` or `shelf: ^1.4.0` | `test: ^1.25.0`, `lints: ^5.0.0` | Direct reuse of Domain & Application packages. |
