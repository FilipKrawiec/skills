# Dart and Flutter Test Guidelines

## Default Stack

- Pure Dart Runner: `dart test` via `package:test` for domain, application, and Dart backend packages.
- Flutter UI / Widget Runner: `flutter test` via `package:flutter_test` for presentation and widget suites.
- Assertions: `package:test/expect.dart` matchers (`expect(actual, equals(expected))`, `isA<T>()`).
- State Management & Routing: `package:riverpod` (`ProviderContainer` for unit tests, `ProviderScope(overrides: [...])` for widget tests) and `go_router` for route testing (`GoRouter.testing(...)` or pumped router configs).
- Mocks & Fakes: In-memory fake ports (e.g. `MemoryUsers implements Users`) preferred over mock packages (Chicago-style state verification).
- Integration / Firebase: Test against Firebase Local Emulator Suite for Firestore, Auth, and Cloud Storage adapters.

## Scenario Shape

- Use `group` blocks for `Given` and `When`; use `test` (or `testWidgets`) for `Then`.
- Assert state changes through public observable seams on aggregates and use-case outcomes.
- Mock or fake outbound infrastructure ports; keep domain and application logic pure and fast.
- Explicitly `await` async use cases, futures, and pump cycles (`tester.pumpAndSettle()`).

## Component, UI, And Infrastructure Tests

- Package / Script layout:
  - Unit tests (`test/unit/` or `test/domain/`, `test/application/`): Fast pure Dart unit tests executing via `dart test`. Zero Flutter binding dependencies.
  - Widget / Presentation tests (`test/presentation/` or `test/widget/`): Rendered widget checks executing via `flutter test`. Use Riverpod provider overrides to stub Application use cases or queries without booting external systems.
  - Infrastructure / Adapter tests (`test/infrastructure/` or `integration_test/`): Firestore, SQLite/drift, or HTTP client adapter verification against real local emulators (e.g. `firebase emulators:exec "dart test"`).
- In widget tests, find elements by semantic properties, keys, or localized text rather than deep widget tree structure.
- Assert presentation state changes and user interaction handling (e.g. tapping buttons, entering text, validating loading/error states).
