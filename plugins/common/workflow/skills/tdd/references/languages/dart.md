# Dart and Flutter Test Guidelines

## Default Stack

- Runner by package type: pure Dart packages (no Flutter SDK dependency) run `dart test`; every test inside a Flutter package, including pure unit tests, runs `flutter test`. Prefer the project's wrapper command when one exists.
- Assertions: `package:test/expect.dart` matchers (`expect(actual, equals(expected))`, `isA<T>()`).
- State Management & Routing: `package:riverpod` (`ProviderContainer` for unit tests, `ProviderScope(overrides: [...])` for widget tests) and `go_router` for route testing (`GoRouter.testing(...)` or pumped router configs).
- Mocks & Fakes: In-memory fake ports (e.g. `MemoryUsers implements Users`) preferred over mock packages (Chicago-style state verification).
- Integration / Firebase: Firebase adapters are integration-suite territory (Local Emulator Suite); unit and widget suites use in-memory adapters of the same port.
- Time: production code reads `clock.now()` (`package:clock`) so `testWidgets` fake time controls it; `DateTime.now()` makes timer-based tests flaky under load.

## Scenario Shape

- Use `group` blocks for `Given` and `When`; use `test` (or `testWidgets`) for `Then`.
- Assert state changes through public observable seams on aggregates and use-case outcomes.
- Mock or fake outbound infrastructure ports; keep domain and application logic pure and fast.
- Explicitly `await` async use cases, futures, and pump cycles (`tester.pumpAndSettle()`).

## Component, UI, And Infrastructure Tests

- Package / Script layout:
  - Unit tests (`test/unit/` or `test/domain/`, `test/application/`): Fast unit tests with zero widget pumping; run with the package's runner (see Default Stack).
  - Widget / Presentation tests (`test/presentation/` or `test/widget/`): Rendered widget checks executing via `flutter test`. Use Riverpod provider overrides to stub Application use cases or queries without booting external systems.
  - Infrastructure / Adapter tests (`test/infrastructure/` or `integration_test/`): Firestore, SQLite/drift, or HTTP client adapter verification against real local emulators (e.g. `firebase emulators:exec "dart test"`).
- In widget tests, find elements by semantic properties, keys, or localized text rather than deep widget tree structure.
- Assert layout as relations (centres aligned, equal gutters, sizes equal to theme tokens, `greaterThanOrEqualTo(kMinInteractiveDimension)`) instead of pixel literals.
- Treat the "would not hit test" warning as a missed tap: bring the target into view (`Scrollable.ensureVisible(..., alignment: 0.5)`) before tapping.
- `tester.drag` / `tester.tap` default to touch; pass `kind: PointerDeviceKind.mouse` when exercising desktop pointer paths.
- Assert presentation state changes and user interaction handling (e.g. tapping buttons, entering text, validating loading/error states).
