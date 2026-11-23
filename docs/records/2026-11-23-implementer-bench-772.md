# Implementer bench: ddd and hexagonal-architecture state every rule

Issue #772, epic #769. `workflow bench --implementer --run --baseline origin/main` compares the working tree (rules folded into the two `SKILL.md` files, rule references removed, profiles deferring to project tools) with `origin/main`. Same setup as the [baseline record](2026-11-23-implementer-bench-baseline.md): sonnet, low effort, two TypeScript tasks, 10 USD cap. [Result JSON](2026-11-23-implementer-bench-772-results.json).

| Arm | layers | primitives | red | gate | Overall | Cost per task | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| current (this change) | 2/2 | 2/2 | 2/2 | 2/2 | 8/8 (1) | $0.15 | $0.31 |
| baseline (origin/main) | 2/2 | 2/2 | 2/2 | 2/2 | 8/8 (1) | $0.16 | $0.32 |

The pass rate with this change equals the baseline at no higher cost per task; total run cost $0.63 of the 10 USD cap, nothing skipped. Both arms still pass every check, so the seeded tasks do not separate the wordings (the ceiling effect the baseline record names).
