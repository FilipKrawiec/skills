# Dart and Flutter Test Guidelines

## Default Stack

- Runner by package type: pure Dart packages (no Flutter SDK dependency) run `dart test`; every test inside a Flutter package, including pure unit tests, runs `flutter test`. Prefer the project's wrapper command when one exists.
- Assertions: `package:test/expect.dart` matchers (`expect(actual, equals(expected))`, `isA<T>()`).
- State Management & Routing: use the override and test hooks of the state-management and router packages the project already has; stub application use cases at the presentation boundary.
- Mocks & Fakes: In-memory fake ports (e.g. `MemoryUsers implements Users`) preferred over mock packages (Chicago-style state verification).
- Integration: backend SDK and database adapters are integration-suite territory (local emulator or real local database); unit and widget suites use in-memory adapters of the same port.
- Time: production code reads `clock.now()` (`package:clock`) so `testWidgets` fake time controls it; `DateTime.now()` makes timer-based tests flaky under load.

## Scenario Shape

- Use `group` blocks for `Given` and `When`; use `test` (or `testWidgets`) for `Then`.
- Assert state changes through public observable seams on aggregates and use-case outcomes.
- Mock or fake outbound infrastructure ports; keep domain and application logic pure and fast.
- Explicitly `await` async use cases, futures, and pump cycles (`tester.pumpAndSettle()`).

## Component, UI, And Infrastructure Tests

- Package / Script layout:
  - Unit tests (`test/unit/` or `test/domain/`, `test/application/`): Fast unit tests with zero widget pumping; run with the package's runner (see Default Stack).
  - Widget / Presentation tests (`test/presentation/` or `test/widget/`): Rendered widget checks executing via `flutter test`. Stub Application use cases or queries at the presentation boundary without booting external systems.
  - Infrastructure / Adapter tests (`test/infrastructure/` or `integration_test/`): database, backend SDK or HTTP client adapter verification against real local emulators or databases.
- In widget tests, find elements by semantic properties, keys, or localized text rather than deep widget tree structure; `find.byType` on layout primitives (`Container`, `Padding`, `SizedBox`), `findsNWidgets` counts of them, and reads of an internal widget's property (`AnimatedOpacity.opacity`) pin structure, not behaviour.
- Every `testWidgets` file lives under the widget folder, even when it checks one value; `test/unit/` holds only plain `test` cases.
- Value types are records, or classes with generated equality where the project has a generator; a hand-written `==`/`hashCode`/`copyWith` is tested only through the behaviour it enables (a `Set` deduplicates, an equal state does not notify listeners).
- Assert layout as relations (centres aligned, equal gutters, sizes equal to theme tokens, `greaterThanOrEqualTo(kMinInteractiveDimension)`) instead of pixel literals.
- Treat the "would not hit test" warning as a missed tap: bring the target into view (`Scrollable.ensureVisible(..., alignment: 0.5)`) before tapping.
- `tester.drag` / `tester.tap` default to touch; pass `kind: PointerDeviceKind.mouse` when exercising desktop pointer paths.
- Assert presentation state changes and user interaction handling (e.g. tapping buttons, entering text, validating loading/error states).
