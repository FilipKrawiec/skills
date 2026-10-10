---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area, for architectural boundary breaches, runtime defects, design smells and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Code Review

Review on two axes, A Standards and B Spec; report only what gates miss. Read [hot-paths.md](references/hot-paths.md) for an area audit, or when the code runs per event, frame, keystroke or render, or at startup.

Severity: **Blocker** (`REQUEST_CHANGES`) is a runtime defect, unhandled edge, boundary breach, hollow or failing test; **Major** (`REQUEST_CHANGES` when the diff introduces it) a smell likely to cause a defect or rework soon; **Minor** (suggestion) style, naming, optional refactor. *Blocking* means `REQUEST_CHANGES`.

## 1. Scope

Take the diff and the issue's criteria. Give each axis a fresh-context worker holding only diff, issue and axis; without workers, run them in order.

*Exit gate*: diff and criteria in hand; each axis assigned.

## 2. Axis A: Standards

1. `domain/` imports no outer layer and carries no framework, ORM or serialization annotations; inbound adapters call a use case.
2. Aggregate children change only through their root; one aggregate per transaction; cross-aggregate changes are domain events.
3. An interface needs two implementations (a test fake counts); no 1:1 DTO chains or passthrough modules.
4. Changed presentation keeps its semantics, accessibility and layout.
5. Design smells, each confirmed by reading a sample (invoke `ddd` or `hexagonal-architecture` on modeling or layering doubts):
   - one enum or mode switched in several places, or per-variant fields picked by mode → one variant type owning the behaviour;
   - the same literal set or regex in two files, or primitives beside an existing value object → one value object with one parser;
   - one new case edits N lists kept in step → one source generates the rest;
   - the same wrapper or action hand-built at several call sites → one component declares it;
   - a second undo, cache, debounce or retry → reuse the existing one;
   - production code probing whether it runs under test → inject the behaviour;
   - `==` on a field subset that diffing relies on → compare every observed field.

*Exit gate*: each finding has severity, `file:line`, a failure scenario and one remedy.

## 3. Axis B: Spec

1. An observable test proves every criterion.
2. Hunt runtime defects: empty and boundary cases, unchecked nil, swallowed errors, races, missing `await`, leaks on an exit path, repeated commands duplicating side effects.
3. **Blocker on every diff:** a test named after coverage or asserting mere existence; a test reaching around the design (widened member, backdoor setter, private state, lowered threshold, new exemption); an assertion on structure (layout primitives, internal style, tuning constants).
4. When tests change, also flag tests that assert mock calls or recompute expected values with the production algorithm, test a fake or hand-written equality, sleep instead of using a fake clock, skip a documented range's edges, copy a setup across files, or give a gate no pass and fail fixture per rule.
5. Unasked-for changes are scope creep.

*Exit gate*: as in phase 2.

## 4. Verdict

Merge both axes, most severe first; ≤ 15 lines; omit a silent axis.

```text
Decision: APPROVED | REQUEST_CHANGES
- [Blocker|Major|Minor] [A|B] <file:line> — <defect & failure scenario> → <remedy>
Scope: clean | creep: <files>
```

## Area audit

For a codebase or area instead of a diff: sweep every signal in phases 2 and 3 and the hot paths, and invoke `tdd` to sample mutants on domain files. Report one row per smell ranked by likely rework, then the mutation table.

```text
| Smell | Count | Strongest examples (3 × file:line) | Refactoring | Estimate S/M/L |
```
