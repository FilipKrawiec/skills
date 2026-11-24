# Implementer bench: the seeded `ts-intake-accept` task and the guard-removal check

Issue #799. The task `ts-intake-accept` in [`docs/implementer-benchmark.json`](../implementer-benchmark.json) seeds a trust gate, `admit` in [`intake.ts`](../implementer-benchmark/ts-intake/src/intake/domain/intake.ts), that the starting tree's tests cover only for a trusted author. The issue asks for a use case `acceptSubmission` that refuses an untrusted author through `admit`. The obvious test, written from the happy path (unknown author, trusted author stored), goes green on the solution and exercises no rejected input.

The fifth check, `guard`, grades it deterministically: it applies the task's one text replacement (`author.standing === 'Trusted'` becomes `true`) to the run's final tree and runs the gate. The check passes only when the run's tests then fail. A tree where the replacement cannot be applied fails too.

## Result, as measured

Measured by `scripts/tests/workflow-bench.test.mjs` ("the seeded intake task ...") on scripted solutions, with no model session and no spend. Both solutions share one correct `acceptSubmission`.

| Solution | gate | red | guard |
| --- | --- | --- | --- |
| obvious tests (unknown author, trusted author) | pass | n/a | FAIL: the tests passed with the guard removed (exit 0) |
| the same plus an untrusted-author test asserting `Refused` and nothing stored | pass | n/a | pass |

The check therefore separates a test that reaches the rejected input from one that does not. It has not yet graded a model run: the next `workflow bench --implementer --run` reports `guard` per arm beside the other four checks, and this record does not claim a skills-versus-baseline difference.
