---
name: review
description: Use when auditing a diff, branch, PR, staged changes, or a whole codebase or area, for architectural boundary breaches, runtime defects, design smells and test rigor.
allowed-tools: Skill Read Bash(git:*)
---

# Code Review

Review on two axes, A Standards and B Spec. Report confirmed defects gates miss, not linter findings or unnamed style preferences. On diffs, omit unrelated pre-existing defects. Read [area-audit.md](references/area-audit.md) for a codebase or area instead of a diff; [hot-paths.md](references/hot-paths.md) for a diff touching hot paths or startup.

**Blocker**: runtime or security defect, unhandled edge, boundary breach or hollow/failing test. **Major**: smell likely to cause defects or rework; blocking on a diff when introduced. Blocking findings require `REQUEST_CHANGES`. **Minor**: optional style, naming or refactoring suggestion; at most three: agent authors spend a round on each.

## 1. Scope

Capture the brief's fields from fetched `origin/<base>`. Apply the agent rules and any `REVIEW.md`; they never lower a Blocker. Reviewers are fresh and never implemented the change. Only `agent-review` posts the binding decision.

A host dispatch supplies the whole brief:

```text
Intent/criteria: <issue, milestone, outcomes, prototype direction>.
Scope: <paths including tests; exclusions and dependencies>.
Checkout: <worktree>; base <ref/SHA>; head <branch/SHA>; last reviewed <SHA|none>.
Decisions/evidence: <approved constraints, commands/exits, captures, earlier or to-verify findings>.
Load `review`; run only axis <A|B> against the captured diff. No edits, posting or dispatch.
Return the phase 4 verdict.
```

A personal audit may run both axes. **Verify** (the brief lists findings): re-read each at head and trace its scenario; return confirmed or rejected with a reason; raise nothing new.

**Re-review** (an earlier verdict exists): judge only the change's own commits since the last reviewed head (`git range-diff <base> <last> <head>`) and whether earlier findings are fixed; never repeat an answered finding, or rounds never converge.

*Exit gate*: diff and criteria in hand; each axis assigned.

## 2. Axis A: Standards

1. If layered (`domain/`): `domain/` imports no outer layer and carries no framework, ORM or serialization annotations; inbound adapters call a use case.
2. With aggregates: children change only through their root; one aggregate per transaction; cross-aggregate changes are domain events.
3. An interface needs two implementations (a test fake counts); no 1:1 DTO chains or passthrough modules.
4. An outer layer maps a domain enum in one mapper; exhaustive matching on a sealed type is fine.
5. Changed presentation keeps semantics, accessibility and layout.
6. Design smells, each confirmed by reading a sample (ask the host to adjudicate doubts):
   - one enum or mode switched in several places, or per-variant fields picked by mode → one variant type owning the behaviour;
   - the same literal set or regex in two files, or primitives beside an existing value object → one value object with one parser;
   - one new case edits N lists kept in step → one source generates the rest;
   - the same wrapper or action hand-built at several call sites → one component declares it;
   - a second undo, cache, debounce or retry → reuse the existing one; static helpers all taking one domain type → move them onto the type;
   - production code probing whether it runs under test → inject the behaviour;
   - `==` on a field subset that diffing relies on → compare every observed field.
7. The change breaks, or makes stale, a line in the agent rules or `REVIEW.md`.

*Exit gate*: each finding has severity, a `file:line` you read (never inferred from a name), a failure scenario and one remedy. Report a defect class once, with every instance.

## 3. Axis B: Spec

1. An observable test proves every criterion.
2. Hunt runtime defects: empty and boundary cases, unchecked nil, swallowed errors, races, missing `await`, leaks on an exit path, repeated commands duplicating side effects, a fix patching a symptom instead of the root cause; unvalidated input in queries, shell or paths, missing authorization, secrets in code or logs.
3. **Blocker on every diff:** a test named after coverage or asserting mere existence; a test reaching around the design (widened member, backdoor setter, private state, lowered threshold, new exemption); an assertion on structure (layout primitives, internal style, tuning constants).
4. When tests change, also flag: untested failure paths; no final outcome assertion; a flipped condition no test catches; UI tests of pure logic; asserted mock calls; expected values recomputed by the production algorithm; testing a fake or hand-written equality; sleeps instead of a fake clock; untested documented range edges; setup copied across files; a gate lacking a pass and fail fixture per rule.
5. Unasked-for changes are scope creep.

*Exit gate*: as in phase 2.

## 4. Verdict

A Blocker or Major blocks only once a fresh verifier confirms it. Report by severity in ≤8 lines. A changed head or review-relevant base invalidates the verdict; name missing evidence.

```text
Decision: 1 blocking, 0 optional — REQUEST_CHANGES   (clean: "0 findings, nothing to fix — APPROVED")
- [Major] [B] src/order.py:12, src/refund.py:40 — <defect & failure scenario> → <remedy>
Scope: clean | creep: <files>
Evidence: <base/head SHAs; commands/exits; remaining decisions>
```
