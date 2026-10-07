# Mutation Testing

## Scope

| Situation | Depth |
| --- | --- |
| One function whose mistake corrupts data or misleads the user | Flip one condition or constant by hand; run its tests |
| An area under audit | Seeded sample per file, until 10 mutants are scored or 20 sites tried |
| A project gate | The language's mutation tool (named in its language file) on domain packages, scored per file and ratcheted |

Without a fitting tool, a sampling script using these operators is enough.

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
| Killed | A test failed or timed out |
| Survived | All tests passed; not equivalent or tuning |
| Invalid | Does not compile; excluded |
| Equivalent | No observable behaviour can differ; excluded |
| Tuning | Changes only a constant no requirement specifies (animation duration, spacing); excluded but listed, never pinned by a test |

## Score

`score = killed / (killed + survived)`, per file and per area.

- Bar: 80% for domain code, on the area total and on each file with ≥ 10 scored mutants.
- A gate tool's per-file score is a ratchet: raise it, never lower it. A sampled score ratchets nothing.
- Kill every survivor with a test, or delete its code.
- Report one table (file, sampled, killed, survived, equivalent, tuning, score), then each survivor as `file:line`, the mutant, and the missing case in words.
