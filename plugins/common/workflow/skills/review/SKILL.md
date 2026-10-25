---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area, for architectural boundary breaches, runtime defects, design smells and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Code Review

Review on two axes, A Standards and B Spec. Report confirmed defects gates miss; omit compiler/linter findings and unnamed style preferences. On diffs, omit unrelated pre-existing defects. Read [area-audit.md](references/area-audit.md) for a codebase or area instead of a diff; [hot-paths.md](references/hot-paths.md) for area audits or hot paths/startup.

**Blocker**: runtime defect, unhandled edge, boundary breach or hollow/failing test. **Major**: smell likely to cause defects or rework; blocking on a diff when introduced. Blocking findings require `REQUEST_CHANGES`. **Minor**: optional style, naming or refactoring suggestion; at most three: agent authors spend a round on each.

## 1. Scope

Capture intent, criteria, scope/tests/dependencies, worktree, fetched `origin/<base>` and head SHAs, decisions and evidence. Read the agent rules and any `REVIEW.md`; they override defaults here. The orchestrator assigns fresh reviewers who did not implement the change. Judge without GitHub credentials; `agent-review` posts the binding GitHub decision, which a verdict never replaces.

A host dispatch supplies the whole brief:

```text
Intent/criteria: <issue, milestone, outcomes, prototype direction>.
Scope: <paths including tests; exclusions and dependencies>.
Checkout: <worktree>; base <ref/SHA>; head <branch/SHA>.
Decisions/evidence: <approved constraints, commands/exits, captures, earlier findings>.
Load `review`; run only axis <A|B> against the captured diff. No edits, posting or dispatch.
Return phase 4 verdict, exact head, evidence and remaining decisions.
```

A personal audit may run both axes serially.

**Re-review** (an earlier verdict exists): judge only the diff since the last reviewed head and whether earlier findings are fixed; never repeat an answered finding, or rounds rediscover old code without converging.

*Exit gate*: diff and criteria in hand; each axis assigned.

## 2. Axis A: Standards

1. If layered (`domain/`): `domain/` imports no outer layer and carries no framework, ORM or serialization annotations; inbound adapters call a use case.
2. With aggregates: children change only through their root; one aggregate per transaction; cross-aggregate changes are domain events.
3. An interface needs two implementations (a test fake counts); no 1:1 DTO chains or passthrough modules.
4. An outer layer maps a domain enum in one mapper; exhaustive matching on a sealed type is fine.
5. Changed presentation keeps semantics, accessibility and layout.
6. Design smells, each confirmed by reading a sample (on doubt, ask the host to adjudicate modeling or layering):
   - one enum or mode switched in several places, or per-variant fields picked by mode → one variant type owning the behaviour;
   - the same literal set or regex in two files, or primitives beside an existing value object → one value object with one parser;
   - one new case edits N lists kept in step → one source generates the rest;
   - the same wrapper or action hand-built at several call sites → one component declares it;
   - a second undo, cache, debounce or retry → reuse the existing one; static helpers all taking one domain type → move them onto the type;
   - production code probing whether it runs under test → inject the behaviour;
   - `==` on a field subset that diffing relies on → compare every observed field.
7. A change breaks a convention in the agent rules or `REVIEW.md`, or leaves a line there stale.

*Exit gate*: each finding has severity, a `file:line` you read (never inferred from a name), a failure scenario and one remedy. Report a defect class once, with every instance.

## 3. Axis B: Spec

1. An observable test proves every criterion.
2. Hunt runtime defects: empty and boundary cases, unchecked nil, swallowed errors, races, missing `await`, leaks on an exit path, repeated commands duplicating side effects, a fix patching a symptom, not the root cause, unvalidated input in queries, shell or paths, missing authorization, secrets in code or logs.
3. **Blocker on every diff:** a test named after coverage or asserting mere existence; a test reaching around the design (widened member, backdoor setter, private state, lowered threshold, new exemption); an assertion on structure (layout primitives, internal style, tuning constants).
4. When tests change, also flag untested failure paths, a test not ending on an outcome assertion, a flipped condition no test catches, UI tests of pure logic, and tests that assert mock calls or recompute expected values with the production algorithm, test a fake or hand-written equality, sleep instead of using a fake clock, skip a documented range's edges, copy a setup across files, or give a gate no pass and fail fixture per rule.
5. Unasked-for changes are scope creep.

*Exit gate*: as in phase 2.

## 4. Verdict

Re-read each finding's `file:line`; drop unconfirmed ones. Report both axes by severity in ≤8 lines, count first. A changed head or review-relevant base invalidates it; name missing evidence.

```text
Decision: APPROVED | REQUEST_CHANGES — <N> blocking, <M> optional | nothing to fix
- [Blocker|Major|Minor] [A|B] <file:line> — <defect & failure scenario> → <remedy>
Scope: clean | creep: <files>
Evidence: <head SHA; commands/exits; remaining decisions>
```
