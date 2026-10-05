# Mutation Testing

Line coverage says a line ran; a mutant says whether any test noticed the line was wrong.

## Scope

| Situation | Depth |
| --- | --- |
| One function whose mistake would corrupt data or mislead the user | Flip one condition or constant by hand and run its tests |
| A domain or application area under audit | Seeded sample per file, until 10 mutants are scored or 20 sites are tried |
| A project gate | The language's mutation tool on domain packages, scored per file and ratcheted |

Prefer the language's established mutation tool, which the language reference names. Where none fits, a sampling script with the operators below is enough.

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
| Survived | Every test passed, and the mutant is neither equivalent nor tuning |
| Invalid | The mutant does not compile; excluded from the score |
| Equivalent | Every test passed, and no observable behaviour can differ (a redundant guard); excluded from the score |
| Tuning | Every test passed, and the mutant changes only a constant no requirement specifies (an animation duration, a spacing); excluded from the score and listed, because a test pinning it would couple to structure |

## Score

`score = killed / (killed + survived)`, per file and for the area; invalid, equivalent and tuning mutants are not counted.

- The bar is 80% for domain code, applied to the area total and to each file with at least 10 scored mutants; a smaller sample is too noisy to judge one file.
- A per-file score from the project gate's mutation tool is a ratchet: a change may raise it, never lower it. A sampled score moves with the sites the seed picks, so it informs the audit and ratchets nothing.
- The report is one table (file, sampled, killed, survived, equivalent, tuning, score), then each survivor as `file:line`, the mutant, and the missing case in words.
