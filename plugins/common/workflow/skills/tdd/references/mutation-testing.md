# Mutation Testing

## Scope

| Situation | Depth |
| --- | --- |
| One function whose mistake corrupts data or misleads the user | Flip one condition or constant by hand; run its tests |
| An area under audit | Seeded sample per file, until 10 mutants are scored or 20 sites tried |
| A project gate | Configured reproducible mutation tool and scope, stricter on changed/critical behavior, scored and ratcheted |

Without a fitting tool, manually sample these operators for diagnosis; sampling does not replace a required project gate. Missing required measurement blocks completion.

## Operators

| Operator | Mutation |
| --- | --- |
| Relational boundary | `<` ↔ `<=`, `>` ↔ `>=` |
| Equality | `==` ↔ `!=` |
| Logical | `&&` ↔ `\|\|` |
| Arithmetic | `+` ↔ `-`, `*` ↔ `/`, `%` → `*` |
| Constant | `n` → `n + 1`; `true` ↔ `false` |
| Negation | `!x` → `x` |
| Return | empty collection, `null` or the type's default |

Never mutate string literals, comments, imports, logging or generated files.

## Sampling

- Mutate in a throwaway worktree and restore each file in a `finally` block.
- Rank files by risk: money, stored data, values the user acts on, then branching density.
- Skip a file whose own tests fail before mutation.
- Run only the tests that exercise the mutated file.
- Pick sites with a fixed seed so reruns sample the same mutants.

## Classification

| Result | Meaning |
| --- | --- |
| Killed | An attributable test assertion failed, or an isolated mutant timed out under the configured reproducible limit with a passing baseline |
| Incomplete | Whole measurement timed out, runner failed or evidence is missing; never a kill or a gate pass |
| Survived | All tests passed; not equivalent or tuning |
| Invalid | Does not compile; excluded |
| Equivalent | No observable behaviour can differ; excluded |
| Tuning | Changes only a constant no requirement specifies (animation duration, spacing); excluded but listed, never pinned by a test |

## Score

`score = killed / (killed + survived)`, per file and per area.

- Apply configured project mutation, coverage and risk gates; use stricter gates for changed and critical behavior, not a universal score.
- Ratchet measured confidence. Weakening thresholds, narrowing scope, adding exclusions or resetting a baseline requires explicit owner approval with impact evidence. A sampled score ratchets nothing.
- Classify survivors with behavioral evidence; add meaningful tests or remove unneeded behavior. Do not pin unspecified tuning constants or force churn for a score.
- Record revision, toolchain, command/exit, scope, operators, seed, baseline and artifacts. Compare duration only for equivalent scope, environment and warm/cold conditions. Missing or incomplete evidence blocks a gate.
- Report one table (file, sampled, killed, survived, equivalent, tuning, score), then each survivor as `file:line`, the mutant, and the missing case in words.
