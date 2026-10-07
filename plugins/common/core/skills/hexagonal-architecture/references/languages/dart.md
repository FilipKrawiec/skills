# Dart and Flutter

No state-management, routing or backend package is prescribed: use the codebase's, and treat each as an adapter.

## Layout

- Single package: `lib/src/<feature>/{domain,application,infrastructure,presentation}/` (`api/` instead of `presentation/` on a Dart server).
- Workspace: `packages/<feature>_domain` and `<feature>_application` are pure Dart (`sdk: ^3.3.0`) with no Flutter, backend SDK, HTTP, storage or serialization dependency; `<feature>_infrastructure` implements the ports; the app and any server consume the same packages.
- Domain never imports `flutter`, SDKs, HTTP, local storage or code-generation annotations (`json_serializable`, `freezed`'s JSON).
- Name the aggregate file after its repository port (`domain/users.dart`), one root per file, holding its creation, sealed outcomes, events, value types and `abstract interface class Users` when they belong only to it.
- Adapters: `infrastructure/firestore_users.dart` → `FirestoreUsers`; in-memory fakes `MemoryUsers`.

## Domain idioms

- `final` fields only; behaviour returns a new aggregate plus recorded events, never mutates.
- Value Objects: `extension type` or an immutable class with `==`/`hashCode`, behind one validating factory constructor.
- Expected failures are `sealed class` outcomes matched exhaustively with `switch`; the domain never throws for business rules.
- Domain code is synchronous: no `Future`, `Stream` or IO. Async belongs to ports, adapters and use cases.
- Inject `abstract interface class Clock` or an ID port when time or identity must be deterministic; never call `DateTime.now()` in the domain.
- Static helpers are `abstract final class` with no constructor.

## Application

- One use case class per file (`ChangeUserEmailUseCase`) returning a `sealed class` result (`Success`, `UserNotFound`), never an SDK exception.
- Query ports (`UserQueries`) return read models tailored to the use case, never SDK documents or raw maps.

## Adapters

- SDK types (Firestore `DocumentSnapshot`, `Timestamp`) never leave `infrastructure/`; map them explicitly.
- Presentation is an inbound adapter: state holders call use cases and expose view state; widgets never touch ports, repositories or SDKs.
- Construct adapters only at the composition root (`main.dart` or the DI entry, e.g. Riverpod `*_providers.dart`); use cases take ports as required constructor arguments with no default adapter.

## Tests

- Domain and application tests run under `dart test` with no Flutter binding, using in-memory port fakes. Harness and doubles: `tdd`'s Dart profile.
- Adapter tests run against the backend's local emulator.
