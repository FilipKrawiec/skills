# Design Smells and Test Rigor: Area Audit

A diff review sees one change; these smells grow across many. When the review covers a whole codebase or area, sweep for each signal below, confirm a sample by reading the code, and report counts with `file:line` evidence.

## Design Smells

| Smell | Signal to search for | Refactoring |
| --- | --- | --- |
| Repeated conditional | One enum, type tag or string set matched (`switch`, `case X.`, `== X.`) in several files of the same layer to vary the same behaviour; count the files per type and layer | Move the varying behaviour onto the type: enum member, sealed-class method, interface or mixin each variant takes (*Replace Conditional with Polymorphism*), with the exemptions in the review skill's A.5 |
| Selector property bag | A state class with parallel fields per variant (`penColor`, `highlighterColor`) and getters that pick one by the active variant | Hold the variants as one type and expose the active one (`activeBrush`); the picking happens once |
| Stringly typed concept | The same literal set (`'minor'`, `'dorian'`) or the same parsing regex in two or more files | *Introduce Value Object* with one parsing entry and the behaviour each caller reimplemented |
| Parallel registries | Adding one case means editing N lists kept in step (an enum, a lookup map, resource keys, a test table), often guarded by a consistency check | Let one source generate or own the rest: the variant carries its data, or a convention or generator derives the map |
| Call-site decoration | The same wrapper (help, analytics, tracking, semantics) placed around a component at each call site, or a component taking a parameter only to wrap itself | The component declares the capability through an interface or mixin; callers override only a non-default role |
| Duplicated control | One user action (open, edit, share) hand-built on several screens with different looks | One reusable control per action, with the screen-size variants inside it |
| Reimplemented generic | A second hand-rolled undo stack, cache, debounce or retry next to a generic one the codebase already has | Reuse the generic; delete the copy and its tests |
| Compatibility shims | Passthrough getters or setters "for backwards compatibility" with no production caller | Delete them and the tests that only call them |
| Static utility sprawl | Static helper classes whose every method takes the same domain type as first argument | *Move Method* onto that type, or an extension on it |
| Flag-branched class | The same boolean, platform or mode check opens several methods of one class (`if (isWeb)` in five methods) | A Strategy: one implementation per variant, chosen once where the object is built |
| Primitives beside value objects | A state or settings type stores raw numbers and strings while value objects for the same quantities exist unused | Hold the value objects, so bounds and validation live once |
| Test-aware production code | Production code asks whether it runs under a test (runtime type names, environment variables, test-binding probes) | Inject the behaviour as a parameter or port; a test passes the variant it needs |
| Partial equality | `==` compares a subset of fields (a count, an id) while selectors, memoization or diffing rely on it | Compare every field observers depend on; one test where only the omitted field differs |

## Hot Paths

| Smell | Signal to search for | Fix |
| --- | --- | --- |
| Recompute per event | Derivable data (normalized search text, joined content, parsed tokens, regexes) rebuilt per keystroke, frame or render | Compute once per value change and cache it on the value; debounce input |
| Quadratic accumulation | An immutable collection copied whole on every append (a gesture's points per move, full snapshots per undo step) | Accumulate in a buffer while the gesture runs and commit once; store bounded deltas |
| Allocating change check | An equality or "should update" check that builds strings or flattens lists | Compare fields or identities, or a version counter |
| Timer-driven motion | A periodic wall-clock timer moving an animation or scroll | Advance on the frame clock by velocity × elapsed time |
| Broad notification | One item's change rebuilds or notifies the whole screen or list (a shared index passed to every item, a transient pulse held in screen state) | Each item subscribes to its own derived value; a transient event reaches only the listener that shows it |
| Serial startup | Independent initialisations awaited one after another before the first screen | Start them together and await all; defer what the first screen does not need |

## Test Rigor

| Smell | Signal to search for | Remedy |
| --- | --- | --- |
| Coverage test | Test names with "covers", "branches", "coverage", "equality and hash"; existence-only assertions (not null, does not throw, finds the element just rendered) | Assert the behaviour the covered line serves, or delete the line |
| Test reaches around the design | Production members widened or annotated only for tests, backdoor setters, tests driving private state with invented inputs, a lowered coverage threshold or a new coverage exemption in the diff | Redesign the code: extract the logic into a type a test drives through its public interface, inject the dependency, or delete the unreachable line; keep the threshold |
| Testing the double | A test that constructs and exercises a fake or stub defined in the test | Delete it; the fake is proven by the tests that use it |
| Boilerplate tests | Tests for hand-written equality, hash, copy and string-conversion methods | Use language value equality (records, data classes, generated equality), or reach equality through behaviour (a set deduplicates, an equal state does not notify) |
| Structure-coupled | Finding or counting layout primitives (generic boxes, padding, rows), reading animation or style properties of internal widgets, asserting tuning constants | Assert through semantics, keys, visible text, relations between rendered boxes, or the domain value behind the look |
| Misfiled level | UI-booting tests in the unit folder; UI tests checking pure logic | Move pumped tests to the UI suite; extract the logic and unit test it |
| Surviving mutant | Flip one condition or constant in an important function; no test fails | Add the boundary or failure-path case that kills it |
| Act without assert | No assertion at all, interactions after the last assertion, or a silenced missed-interaction warning | End on an assertion of the outcome; let a missed interaction fail |
| Documented edge untested | A documented range, unit or format whose ends and wrap-around have no case (hours in a duration, a cyclic delta at exactly half the cycle: 6 of 12 semitones) | A table test at each documented edge |
| Real-time wait | Sleeps or real delays in tests | Fake clock or fake async scheduler |
| Copied harness | The same setup builder, fake or whole test file repeated across files | One shared helper or fake; delete the copies |
| Untested or evadable gate | A verification script with no fixture tests, or a text pattern an equivalent spelling slips past (a tolerance matcher around the same literal) | A passing and a failing fixture per rule; match parsed syntax |
