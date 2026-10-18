# Script confidence baseline — 2026-10-18

This health slice replaces an unmeasured test suite with reproducible regression gates. It does not equate a passing metric with production readiness. Base: `93ed7e9`; the PR and CI run identify the resulting exact revision.

## Reproduce

Activate a Python 3.15 virtual environment and install `requirements-health.txt`. Its complete resolved dependency graph is pinned; the direct tools are coverage 7.16.2, Cosmic Ray 8.7.0, Radon 6.0.1, Xenon 0.9.3 and PyYAML 6.0.3. No global installation or automatic refresh hook is required.

Run `just verify` for the full suite once under branch measurement, per-script coverage ratchets, complexity bounds and plugin validation. Run the `just mutation <target> <minimum>` entries from the CI matrix for the mutation gates. The mutation recipe requires committed, clean input and archives HEAD into a disposable directory, leaving the working source untouched. CI retains each resulting SQLite session and the coverage/complexity JSON reports as artifacts.

Each mutation configuration names one entire production script and the relevant behavior tests; there are no line, function or operator exclusions. The release Python session excludes the unrelated promotion-shell test class; ordinary full tests still exercise that shell. There is no random sampling or seed: every generated mutant in the configured source is executed. Fail-fast stops a failing mutant's tests at their first failure without reducing the mutant set.

Baseline execution must pass before mutations. Every generated job must then have a normal worker result and a killed/survived test outcome. Empty, missing, malformed, crashed and unfinished sessions fail. A whole-job timeout is therefore missing evidence, never a score. An individual mutant's timeout after a passing baseline uses Cosmic Ray's killed classification under the fixed 40-second per-mutant limit.

## Coverage and risk

Local calibration used macOS arm64 and disposable Python 3.13.16/3.15.0 environments. CI runs the frozen Python 3.15.0/Ubuntu 26.04 combination; its exact-head results govern acceptance. Coverage includes subprocesses and all Python scripts, excluding the tests themselves. No production branch or line was exempted.

| Script | Before, branch-aware coverage | After calibration | CI floor |
| --- | ---: | ---: | ---: |
| project-verify.py | 51% | 95.34% | 95.33% |
| release.py | 96% | 100% | 100% |
| validate-plugin-definitions.py | 67% | 88.15% | 88.14% |
| check-mutation-results.py | New | 100% | 100% |

The 3.13 measurements before/after use the same interpreter, tool configuration and script scope. The new gate helper has no before value. Copied CLI fixtures exercise the exact script bytes in temporary projects; coverage does not attribute all those copied paths back to the original script. Mutation testing still exercises the copied mutated bytes. Do not interpret that collector limitation as proof those branches are absent or covered.

Xenon bounds absolute complexity at D, module averages at C and the overall average at B. Release and the new gate helper have the stricter absolute C bound. These are initial limits derived from existing code, not a claim that the legacy hotspots are optimal. Radon reports the largest existing functions: fallback YAML parsing at 27, skill validation at 26 and metadata validation at 20. Their remaining risk is visible in the artifact; extracting helpers merely to change a score is not an improvement.

A diagnostic CRAP calculation uses per-function executed-statement coverage and Radon complexity: `CC² × (1 − coverage)³ + CC`. After the added tests, the fallback parser remains 27 and skill validation approximately 26: covering them does not remove their structural complexity. CRAP is diagnostic here, not an additional independently calibrated pass/fail gate.

## Mutation evidence and limitations

The CI matrix carries the measured raw kill-rate floors per script. The initial complete sessions, including all surviving diffs, are retained in the CI artifacts; no equivalent/tuning survivors are silently removed to inflate the score. The new helper exists because Cosmic Ray's `cr-rate` returns a passing result even for an unfinished session, and its zero-threshold option does not enforce a gate. The helper checks completeness before applying the measured minimum.

Complete local calibration sessions (no equivalent/operator exclusions):

| Script | Generated/completed | Killed | Survived | Raw floor |
| --- | ---: | ---: | ---: | ---: |
| project-verify.py | 246/246 | 186 | 60 | 75.60% |
| validate-plugin-definitions.py | 793/793 | 704 | 89 | 88.77% |
| release.py | 146/146 | 119 | 27 | 81.50% |
| check-mutation-results.py | 96/96 | 88 | 8 | 91.66% |

The first three use Python 3.13.16; the helper uses 3.15.0. Review exposed a masked threshold test; correcting its fixture killed four more mutants and raised the helper ratchet from 87.50% to 91.66% before delivery. Initial validator calibration before the CLI/retired-material cases killed 592/793; the added behavior cases killed 112 previously surviving mutants. Exact-head CI reruns every session on the frozen 3.15 toolchain, and governs acceptance. Local database files are diagnostic inputs, not substitutes for CI artifacts. Final exact-head evidence is summarized in the PR. A raw tool kill is not a probability of correctness: generated compile/runtime failures count as kills, and equivalent changes can survive. Inspect surviving diffs to distinguish missing requirements from equivalent mutations. For example, changing an exit-status equality from `== 0` to `<= 0` is equivalent for the subprocess status contract; a surviving skipped package check is actionable. Do not add assertions for arbitrary log wording merely to improve a score.

Meaningful additions cover fallback parser values, nested task selection, command failure propagation and working directory, malformed or missing instructions, package identity/version drift, unsafe names/links, CLI sync/repair, repository documentation checks, retired material, missing release remotes and empty package trees. The gate helper tests threshold boundaries, fractional scores, zero kills, missing/pending/invalid/orphan results and missing databases using real SQLite files.

No test-speed improvement is claimed. A shared-Git-fixture experiment showed no clear gain and was removed. Baseline suite timing was about 10.6 seconds on the local 3.13 measurement environment; added cases and instrumentation increase work. Compare future timing only with the same scope, interpreter, dependency graph, machine and warm/cold state. Full mutations run separately in disjoint CI jobs; the 30-minute whole-job limit fails closed.

## Ratchet policy

Keep per-script floors and configured scope. A new production script needs its coverage and mutation gate in the same change. Raise floors when confidence improves; lowering them, excluding source/operators or resetting the baseline requires owner approval with the impact shown. Missing evidence blocks merge through the required `verify` aggregate job. Remaining survivors are maintenance evidence, not permission to weaken the baseline.

These gates do not prove host credential isolation, distributed claims, production approval or deployment acceptance. The publication hold remains in place; those controls retain their separate readiness record.

## Tool references

- [Coverage configuration and subprocess measurement](https://coverage.readthedocs.io/en/latest/config.html).
- [Cosmic Ray configuration, baseline and complete sessions](https://cosmic-ray.readthedocs.io/en/latest/tutorials/intro/index.html).
- [Radon complexity output](https://radon.readthedocs.io/en/stable/commandline.html).
- [Xenon complexity gates](https://xenon.readthedocs.io/en/latest/).
