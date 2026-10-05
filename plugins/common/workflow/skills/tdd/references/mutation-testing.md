# Mutation Testing

Line coverage says a line ran; a mutant says whether any test noticed the line was wrong. In one audited codebase every file sat at 100% line coverage, yet the tests caught 59–68% of seeded mutants and missed shipped bugs at documented edges.

## Scope

| Situation | Depth |
| --- | --- |
| One function whose mistake would corrupt data or mislead the user | Flip one condition or constant by hand and run its tests |
| A domain or application area under audit | Seeded sample, 6–10 mutants per file |
| A project gate | The language's mutation tool on domain packages, scored per file and ratcheted |

Prefer the language's established tool (PIT for JVM languages, Stryker for JavaScript, TypeScript and C#, cargo-mutants for Rust, mutmut for Python). Where none fits, a sampling script with the operators below is enough.

## Operators

| Operator | Mutation |
| --- | --- |
| Relational boundary | `<` ↔ `<=`, `>` ↔ `>=` |
| Equality | `==` ↔ `!=` |
| Logical | `&&` ↔ `\|\|` |
| Arithmetic | `+` ↔ `-`, `*` ↔ `/`, `%` → `*` |
| Constant | integer `n` → `n + 1`; `true` ↔ `false` |
| Negation | `!x` → `x` |
| Return | return an empty collection, `null` or the type's default |

Mutate code only: skip string literals, comments, imports, logging and generated files.

## Sampling Procedure

1. Work in a throwaway worktree, so a crash never leaves a mutant in the real checkout.
2. Rank target files by risk: money, stored data, values the user acts on (durations, keys, tempos), then branching density.
3. Run each target's own tests once as the baseline; skip a file whose baseline fails.
4. With a fixed seed, sample mutation sites per file. Apply one mutant, run only the tests that exercise that file, and restore the source in a `finally` block.
5. Classify each run: *killed* (a test failed or timed out), *survived* (all passed), *invalid* (does not compile; excluded).
6. Read every survivor. Mark it *equivalent* when behaviour cannot differ (a redundant guard, an unspecified tuning constant); otherwise it is a missing test.

## Score and Action

`score = killed / (killed + survived − equivalent)`, per file and in total.

- A domain file below 80% has a test-effectiveness finding, whatever its line coverage.
- Each non-equivalent survivor gets the boundary or failure-path test that kills it, or its code is deleted when no behaviour needs it.
- A recorded per-file score is a ratchet: a change may raise it, never lower it.

## Report

One table (file, sampled, killed, survived, equivalent, score), then each non-equivalent survivor as `file:line`, the mutant, and the missing case in words.
