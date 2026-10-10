---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area, for architectural boundary breaches, runtime defects, design smells and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Code Review

Review on two axes, A Standards and B Spec; report only what gates miss. Read [hot-paths.md](references/hot-paths.md) for an area audit, or when the code under review runs per event, frame, keystroke or render, or at startup.

## Severity

- **Blocker** (`REQUEST_CHANGES`): runtime defect, unhandled edge, boundary breach, hollow or failing test.
- **Major** (`REQUEST_CHANGES` when the diff introduces it): smell likely to cause a defect or rework soon.
- **Minor** (`APPROVED`, as suggestions): style, naming, optional refactor.

*Blocking* means `REQUEST_CHANGES`.

## 1. Scope

Take the diff (branch against base, `git diff HEAD~1`, or staged) and the issue's criteria. Give each axis a fresh-context worker holding only diff, issue and axis; without workers, run them in order.

*Exit gate*: diff and criteria in hand; each axis assigned.

## 2. Axis A: Standards

1. `domain/` imports no outer layer and carries no framework, ORM or serialization annotations; inbound adapters always call a use case.
2. Aggregate children change only through their root; one aggregate per transaction; cross-aggregate changes are domain events.
3. An interface needs two implementations (a test fake counts); no 1:1 DTO chains or passthrough modules.
4. An outer layer maps a domain enum in one mapper; exhaustive matching on a sealed data type is fine.
5. Changed presentation keeps its semantics, accessibility and layout.
6. Design smells (signal → fix), each confirmed by reading a sample. Invoke `ddd` or `hexagonal-architecture` for modeling or layering doubts.
   - One enum, tag or mode switched in several places → move the behaviour onto the type, or a strategy chosen at construction.
   - Parallel per-variant fields picked by mode (`penColor`, `highlighterColor`) → one variant type.
   - The same literal set or regex in two files, or primitives beside an existing value object → one value object with one parser.
   - One new case edits N lists kept in step → one source owns or generates the rest.
   - The same wrapper (help, analytics, semantics) per call site, or one action hand-built on several screens → one component declares it.
   - A second undo, cache, debounce or retry, or static helpers all taking one domain type → reuse the generic; move the helpers onto the type.
   - Production code probing whether it runs under test → inject the behaviour.
   - `==` on a field subset that diffing relies on → compare every observed field.

*Exit gate*: each finding has severity, `file:line`, a failure scenario and one remedy.

## 3. Axis B: Spec

1. An observable test proves every criterion.
2. Runtime defects: boundaries, unchecked nil, swallowed errors, races, missing `await`, leaks on an exit path, a repeated command duplicating side effects.
3. Tests assert state and events, not mock calls; expected values are sourced independently; failure paths are tested; each test ends on an outcome assertion.
4. **Blocker on every diff:** a test named after coverage or asserting mere existence; a test reaching around the design (widened member, backdoor setter, private state, lowered threshold, new exemption), whose fix is a production redesign; a structure-coupled assertion (layout primitives, internal style, tuning constants).
5. When tests change, also flag: tests of a fake or of hand-written equality, hash, copy or toString; UI tests of pure logic or in the unit folder; an untested range edge; sleeps instead of a fake clock; a copied setup or fake; a gate without a pass and a fail fixture per rule; a flipped condition that fails no test.
6. Unasked-for changes are scope creep.

*Exit gate*: as in phase 2.

## 4. Verdict

Both axes, most severe first; ≤ 15 lines; omit a silent axis.

```text
Decision: APPROVED | REQUEST_CHANGES
- [Blocker|Major|Minor] [A|B] <file:line> — <defect & failure scenario> → <remedy>
Scope: clean | creep: <files>
```

## Area audit

For a whole codebase or area instead of a diff: sweep every signal in phases 2 and 3 and in the hot-path checks, and invoke `tdd` to sample mutants on domain files. Report one row per smell ranked by likely rework, then the mutation table; no line cap.

```text
| Smell | Count | Strongest examples (3 × file:line) | Refactoring | Estimate S/M/L |
```
