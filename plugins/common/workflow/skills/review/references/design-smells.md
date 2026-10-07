# Design Smells and Test Rigor

Format: **smell**: signal → fix. Confirm each by reading a sample.

## Design Smells

- **Repeated conditional**: one enum, tag or string set switched in several files of a layer → move the behaviour onto the type.
- **Selector property bag**: parallel per-variant fields (`penColor`, `highlighterColor`) picked by mode → one variant type, expose the active one.
- **Stringly typed concept**: same literal set or regex in two files → *Introduce Value Object* with one parser.
- **Parallel registries**: one new case edits N lists kept in step → one source owns or generates the rest.
- **Call-site decoration**: same wrapper (help, analytics, semantics) per call site → the component declares it via interface or mixin.
- **Duplicated control**: one action hand-built on several screens → one reusable control.
- **Reimplemented generic**: second undo, cache, debounce or retry → reuse the generic; delete the copy.
- **Compatibility shims**: passthroughs without production callers → delete them and their tests.
- **Static utility sprawl**: static helpers all taking one domain type first → *Move Method* onto it.
- **Flag-branched class**: same mode check in several methods → Strategy chosen at construction.
- **Primitives beside value objects**: raw numbers stored while value objects exist → hold those.
- **Test-aware production code**: code probing whether it runs under test → inject the behaviour.
- **Partial equality**: `==` on a field subset that diffing relies on → compare every observed field.

## Hot Paths

- **Recompute per event**: derivable data rebuilt per keystroke, frame or render → cache on the value; debounce.
- **Quadratic accumulation**: immutable collection copied per append → buffer, commit once; store deltas.
- **Allocating change check**: equality building strings or lists → compare fields or a version counter.
- **Timer-driven motion**: wall-clock timer moving animation or scroll → frame clock.
- **Broad notification**: one item's change rebuilds the whole list → per-item subscriptions.
- **Serial startup**: independent inits awaited in sequence → start together; defer the rest.

## Test Rigor

- **Coverage test**: names saying "covers" or "coverage"; existence-only assertions → assert the behaviour, or delete the line.
- **Test reaches around the design**: members widened for tests, backdoor setters, private state driven, lowered threshold, new exemption → redesign production code (extract a publicly testable type, inject, or delete); threshold and exemptions stay.
- **Testing the double**: a test exercising its own fake → delete it.
- **Boilerplate tests**: tests of hand-written equality, hash, copy, toString → language value equality.
- **Structure-coupled**: finding or counting layout primitives, reading internal style, asserting tuning constants → assert semantics, text, box relations or domain values.
- **Misfiled level**: UI tests in the unit folder, or of pure logic → move them; unit test extracted logic.
- **Surviving mutant**: a flipped condition fails no test → add the killing case.
- **Act without assert**: no final outcome assertion, or a silenced missed-tap warning → end on the outcome.
- **Documented edge untested**: range ends or wrap-around without a case → table test per edge.
- **Real-time wait**: sleeps in tests → fake clock.
- **Copied harness**: same setup or fake across files → one shared helper.
- **Untested or evadable gate**: no fixtures, or another spelling slips past → pass and fail fixture per rule; match parsed syntax.

## Area Audit

Sweep every signal above, invoke `tdd` to sample mutants on domain files, then report one row per smell ranked by likely rework, then the mutation table; no line cap.

```text
| Smell | Count | Strongest examples (3 × file:line) | Refactoring | Estimate S/M/L |
```
