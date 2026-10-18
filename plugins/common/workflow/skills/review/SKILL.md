---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area, for architectural boundary breaches, runtime defects, design smells and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Code Review

Review on two axes, A Standards and B Spec. Report confirmed defects gates miss; omit compiler/linter findings and unnamed style preferences. On diffs, omit unrelated pre-existing defects; area audits cover all in-scope code. Read [hot-paths.md](references/hot-paths.md) for area audits or hot paths/startup.

**Blocker**: runtime defect, unhandled edge, boundary breach or hollow/failing test. **Major**: smell likely to cause defects or rework; blocking on a diff when introduced. Blocking findings require `REQUEST_CHANGES`. **Minor**: optional style, naming or refactoring suggestion.

## 1. Scope

Capture intent, criteria, owned scope including tests/dependencies, worktree, base ref/SHA, head ref/SHA, recorded decisions and evidence. The orchestrator assigns fresh read-only reviewer contexts. Code-review verdicts need no GitHub credentials and do not authorize posting an approval or merging. Report findings even when approval credentials are unavailable; `agent-review` owns the separate GitHub approval gate. The host owns model routing. Serialize until proven capability; parallel work requires enforced disjoint scopes including tests and dependencies.

A host dispatch supplies the whole brief:

```text
Intent/criteria: <issue, milestone, outcomes, prototype direction>.
Scope: <paths including tests; exclusions and dependencies>.
Checkout: <worktree>; base <ref/SHA>; head <branch/SHA>.
Decisions/evidence: <approved constraints, commands/exits, captures, findings>.
Review axis <A|B> only against the captured diff and criteria.
No edits, external posting, worker dispatch or further skill invocation.
Return phase 4 verdict, exact head, evidence and remaining decisions.
```

A leaf runs only its assigned axis. Otherwise review both axes serially. Keep invocation depth at most two without cycles; ask the host for leaf expertise when needed.

*Exit gate*: diff and criteria in hand; each axis assigned.

## 2. Axis A: Standards

1. `domain/` imports no outer layer and carries no framework, ORM or serialization annotations; inbound adapters call a use case.
2. Aggregate children change only through their root; one aggregate per transaction; cross-aggregate changes are domain events.
3. An interface needs two implementations (a test fake counts); no 1:1 DTO chains or passthrough modules.
4. An outer layer maps a domain enum in one mapper; exhaustive matching on a sealed type is fine.
5. Changed presentation keeps its semantics, accessibility and layout.
6. Design smells, each confirmed by reading a sample (request leaf modeling or layering adjudication from the host on doubts):
   - one enum or mode switched in several places, or per-variant fields picked by mode → one variant type owning the behaviour;
   - the same literal set or regex in two files, or primitives beside an existing value object → one value object with one parser;
   - one new case edits N lists kept in step → one source generates the rest;
   - the same wrapper or action hand-built at several call sites → one component declares it;
   - a second undo, cache, debounce or retry → reuse the existing one; static helpers all taking one domain type → move them onto the type;
   - production code probing whether it runs under test → inject the behaviour;
   - `==` on a field subset that diffing relies on → compare every observed field.

*Exit gate*: each finding has severity, `file:line`, a failure scenario and one remedy.

## 3. Axis B: Spec

1. An observable test proves every criterion.
2. Hunt runtime defects: empty and boundary cases, unchecked nil, swallowed errors, races, missing `await`, leaks on an exit path, repeated commands duplicating side effects.
3. **Blocker on every diff:** a test named after coverage or asserting mere existence; a test reaching around the design (widened member, backdoor setter, private state, lowered threshold, new exemption); an assertion on structure (layout primitives, internal style, tuning constants).
4. When tests change, also flag untested failure paths, a test not ending on an outcome assertion, a flipped condition no test catches, UI tests of pure logic, and tests that assert mock calls or recompute expected values with the production algorithm, test a fake or hand-written equality, sleep instead of using a fake clock, skip a documented range's edges, copy a setup across files, or give a gate no pass and fail fixture per rule.
5. Unasked-for changes are scope creep.

*Exit gate*: as in phase 2.

## 4. Verdict

Report both axes by severity in ≤8 lines. Blockers require changes; suggestions stay optional. Recheck head and required checks before approval; a changed head invalidates evidence.

```text
Decision: APPROVED | REQUEST_CHANGES
- [Blocker|Major|Minor] [A|B] <file:line> — <defect & failure scenario> → <remedy>
Scope: clean | creep: <files>
Evidence: <head SHA; commands/exits; remaining decisions>
```

## Area audit

For a codebase or area instead of a diff: sweep every signal in phases 2 and 3 and the hot paths, and ask the host for a leaf mutation sample on domain files. Report one row per smell ranked by likely rework, then the mutation table; no line cap.

```text
| Smell | Count | Strongest examples (3 × file:line) | Refactoring | Estimate S/M/L |
```
