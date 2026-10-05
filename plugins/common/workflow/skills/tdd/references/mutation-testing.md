# Mutation Testing

Line coverage says a line ran; a mutant says whether any test noticed the line was wrong.

## Scope

| Situation | Depth |
| --- | --- |
| One function whose mistake would corrupt data or mislead the user | Flip one condition or constant by hand and run its tests |
| A domain or application area under audit | Seeded sample, 10–15 mutants per file |
| A project gate | The language's mutation tool on domain packages, scored per file and ratcheted |

Prefer the language's established tool: PIT for JVM languages, Stryker for JavaScript, TypeScript and C#, cargo-mutants for Rust, mutmut for Python, `mutation_test` for Dart. Where none fits, a sampling script with the operators below is enough.

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

Mutate code only: string literals, comments, imports, logging and generated files stay as they are.

## Sampling Rules

| Concern | Rule |
| --- | --- |
| Isolation | Mutate in a throwaway worktree and restore each file in a `finally` block, so a crash never leaves a mutant in a real checkout |
| Targets | Rank files by risk: money, stored data, values the user acts on (durations, keys, tempos), then branching density |
| Baseline | A file whose own tests fail before mutation is skipped |
| Test set | Each mutant runs only the tests that exercise its file |
| Reproducibility | A fixed seed picks the sites, so a rerun samples the same mutants |

## Classification

| Result | Meaning |
| --- | --- |
| Killed | A test failed or timed out |
| Survived | Every test passed |
| Invalid | The mutant does not compile; excluded from the score |
| Equivalent | A survivor whose behaviour cannot differ (a redundant guard, an unspecified tuning constant); excluded from the score |

## Score

`score = killed / (killed + survived − equivalent)`, per file and for the area.

- The bar is 80% for domain code, applied to the area total and to each file with at least 10 scored mutants; a smaller sample is too noisy to judge one file.
- A recorded per-file score is a ratchet: a change may raise it, never lower it.
- The report is one table (file, sampled, killed, survived, equivalent, score), then each non-equivalent survivor as `file:line`, the mutant, and the missing case in words.
