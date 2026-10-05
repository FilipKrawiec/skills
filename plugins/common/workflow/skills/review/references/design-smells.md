# Design Smells and Test Rigor: Area Audit

A diff review sees one change; these smells grow across many. When the review covers a whole codebase or area, sweep for each signal below, confirm a sample by reading the code, and report counts with `file:line` evidence.

## Design Smells

| Smell | Signal to search for | Refactoring |
| --- | --- | --- |
| Repeated conditional | One enum, sealed type or string set matched (`switch`, `case X.`, `== X.`) in two or more files; count the files per type | Move the varying behaviour onto the type: enhanced-enum member, sealed-class method, interface implemented by each variant (*Replace Conditional with Polymorphism*) |
| Selector property bag | A state class with parallel fields per variant (`penColor`, `highlighterColor`) and getters that pick one by the active variant | Hold the variants as one type and expose the active one (`activeBrush`); the picking happens once |
| Stringly typed concept | The same literal set (`'minor'`, `'dorian'`) or the same parsing regex in two or more files | *Introduce Value Object* with one parsing entry and the behaviour each caller reimplemented |
| Parallel registries | Adding one case means editing N lists kept in step (an enum, a lookup map, resource keys, a test table), often guarded by a consistency check | Let one source generate or own the rest: the variant carries its data, or a convention or generator derives the map |
| Call-site decoration | The same wrapper (help, analytics, tracking, semantics) placed around a component at each call site, or a component taking a parameter only to wrap itself | The component declares the capability through an interface or mixin; callers override only a non-default role |
| Duplicated control | One user action (open, edit, share) hand-built on several screens with different looks | One reusable control per action, with the screen-size variants inside it |
| Reimplemented generic | A second hand-rolled undo stack, cache, debounce or retry next to a generic one the codebase already has | Reuse the generic; delete the copy and its tests |
| Compatibility shims | Passthrough getters or setters "for backwards compatibility" with no production caller | Delete them and the tests that only call them |
| Static utility sprawl | Static helper classes whose every method takes the same domain type as first argument | *Move Method* onto that type, or an extension on it |

## Test Rigor

| Smell | Signal to search for | Remedy |
| --- | --- | --- |
| Coverage test | Test names with "covers", "branches", "coverage", "equality and hash"; assertions only `isNotNull`, `returnsNormally`, or finding the widget just built | Assert the behaviour the covered line serves, or delete the line |
| Testing the double | A test that constructs and exercises a fake or stub defined in the test | Delete it; the fake is proven by the tests that use it |
| Boilerplate tests | Tests for hand-written `==`, `hashCode`, `copyWith`, `toString` | Use language value equality (records, data classes, generated equality), or reach equality through behaviour (a set deduplicates, an equal state does not notify) |
| Structure-coupled | Finding or counting layout primitives (`Container`, `Padding`, `Row`), reading animation or style properties of internal widgets, asserting tuning constants | Assert through semantics, keys, visible text, relations between rendered boxes, or the domain value behind the look |
| Misfiled level | UI-booting tests in the unit folder; UI tests checking pure logic | Move pumped tests to the UI suite; extract the logic and unit test it |
| Surviving mutant | Flip one condition or constant in an important function; no test fails | Add the boundary or failure-path case that kills it |

## Report

For each smell found: the count, the three strongest examples, the refactoring, and an estimate (S, M, L). Rank by defects or rework it is likely to cause, not by count.
