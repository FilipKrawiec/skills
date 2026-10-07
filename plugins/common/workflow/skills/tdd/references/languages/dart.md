# Dart and Flutter Tests

## Stack

- Pure Dart packages run `dart test`; every test in a Flutter package runs `flutter test`. Prefer the project's wrapper command.
- Fakes: in-memory port implementations (`MemoryUsers implements Users`) over mock packages. Mutation: `mutation_test`.
- Backend SDK and database adapters are tested only in the integration suite (local emulator or database); unit and widget suites use in-memory adapters of the same port.
- Use the state-management and router packages' own override hooks; stub use cases at the presentation boundary.
- Production code reads `clock.now()` (`package:clock`), never `DateTime.now()`, so `testWidgets` fake time controls it. Plain `test` cases use `fakeAsync`, never a real `Future.delayed`.

## Shape and layout

- `group` for Given and When, `test`/`testWidgets` for Then. `await` every future and pump (`tester.pumpAndSettle()`).
- Every `testWidgets` file lives in the widget folder, even when it checks one value; the unit folder holds only plain `test` cases.

## Widget traps

- Find by semantics, keys or localized text. `find.byType` on `Container`/`Padding`/`SizedBox`, `findsNWidgets` counts of them, and reads of an internal widget's property (`AnimatedOpacity.opacity`) pin structure.
- Assert layout as relations (aligned centres, equal gutters, sizes equal to theme tokens, `greaterThanOrEqualTo(kMinInteractiveDimension)`). `closeTo(36.0)`, `moreOrLessEquals(28.0)` and literals compared with `constraints.maxWidth` are pixel literals too.
- Treat "would not hit test" as a missed tap: `Scrollable.ensureVisible(..., alignment: 0.5)` first; never lower `warnIfMissed`.
- Pump the narrowest widget that owns the behaviour through the shared pump helper; boot the whole app only for cross-screen journeys.
- Pass environment-dependent behaviour (animate or not, which clock) as a widget parameter; production code never checks `WidgetsBinding.instance` types.
- `tester.tap`/`drag` default to touch; pass `kind: PointerDeviceKind.mouse` for pointer paths.
- Plain data types are records. A value object uses generated equality, or hand-written `==`/`hashCode`/`copyWith` tested only through behaviour (a `Set` deduplicates, an equal state does not notify).
- Reach a `const` class's runtime construction through behaviour; `// ignore: prefer_const_constructors` or a `DateTime.now()` argument defeating const marks a coverage test.
