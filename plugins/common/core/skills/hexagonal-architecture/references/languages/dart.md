# Dart and Flutter

Treat the project's state-management, routing and backend packages as adapters.

## Layout

- Single package: `lib/src/<feature>/{domain,application,infrastructure,presentation}/` (`api/` instead of `presentation/` on a Dart server).
- Workspace: `packages/<feature>_domain` and `<feature>_application` are pure Dart with no Flutter, backend SDK, HTTP, storage or serialization dependency; `<feature>_infrastructure` implements the ports; the app and any server consume the same packages.
- Domain never imports `flutter`, SDKs, HTTP, local storage or serialization code-generation annotations.
- Name the aggregate file after its repository port (`domain/users.dart`), one root per file, holding its creation, sealed outcomes, events, value types and `abstract interface class Users` when they belong only to it.
- Adapters: `infrastructure/firestore_users.dart` → `FirestoreUsers`; in-memory fakes `MemoryUsers`.

## Domain idioms

- Aggregate roots keep private fields and change them only through their own named behaviours, which record events.
- Value Objects: `extension type` or an immutable class with `==`/`hashCode`, behind one validating factory constructor.
- Rebuild entry: one `restore` factory constructor with the narrowest visibility Dart allows (library-private when the adapter shares the library, else public and used only by the adapter).
- Expected failures use the project's established form, else `sealed class` outcomes matched exhaustively with `switch`.
- Domain code is synchronous: no `Future`, `Stream` or IO. Async belongs to ports, adapters and use cases.
- Inject `abstract interface class Clock` or an ID port when time or identity must be deterministic; never call `DateTime.now()` in the domain.
- Static helpers are `abstract final class` with no constructor.

## Application

- One use case class per file (`ChangeUserEmailUseCase`) returning a `sealed class` result (`Success`, `UserNotFound`), never an SDK exception.
- Query ports (`UserQueries`) return application-owned read models tailored to the use case, never SDK documents or raw maps.

## Adapters

- SDK types (Firestore `DocumentSnapshot`, `Timestamp`) never leave `infrastructure/`; map them explicitly.
- Presentation is an inbound adapter: state holders call use cases and expose view state; widgets never touch ports, repositories or SDKs.
- Construct adapters only at the composition root (`main.dart` or the project's DI entry); use cases take ports as required constructor arguments with no default adapter.

## Tests

- Domain and application tests run under the project's configured Dart test runner, else `dart test`, with no Flutter binding, using in-memory port fakes.
- Adapter tests run against the backend's local emulator.
