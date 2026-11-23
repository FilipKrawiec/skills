# Preferences-delivery epic refinement

Issue #775, final slice of epic #769. Slices: #770 (PR #776, drive names the architecture skills and profiles), #774 (PR #777, spec, plan and review read cold, role-scoped preloads), #771 (PR #778, implementer bench), PR #780 (implementer evidence check, a sibling of the epic), #772 (PR #781, ddd and hexagonal-architecture), #773 (PR #782, tdd). Base for "before" is `v11.110.0`; "after" is `dd9d6f02` (v11.115.0 plus #782). All figures come from `git`, the PRs' `workflow:usage` comments, Actions step timestamps and the bench result file.

## Review against the Outcome

| Criterion | Result |
| --- | --- |
| Preferences reach delivery | Met: `implementerBrief` and the review packet name the project's `active_skills` and the language profile (`activeSkills` in `project-verify.mjs`, `architectureNote` in `packet.mjs`), pinned by `workflow-drive.test.mjs` and `workflow-usage-packet.test.mjs`. |
| `SKILL.md` alone is enough | Met: the nine ddd and hexagonal references that held code rules are deleted; no file still links them (searched by name across `plugins`, `docs`, `scripts`). |
| One default per decision, no prescribed frameworks | Met in #772 and #773; profiles read "the project's configured tool, else `<default>`". |
| Readable cold | Met: `spec`, `plan`, `tdd` and `review` carry no coined term from the finding (`Orchestrator`, `Product partner`, `execution label`); `lane:owner` is defined once in `spec`. |
| Each role loads only its own text | Met, figures below. |
| Measured | Not met as worded (pass rate not higher), see below. |

No Blocker or Important finding needs a fix. One Finding-6 leftover stays: the `issue create` rule is still stated in 20 places under `plugins/common/workflow/skills` and `agents`, against 11 in the epic's finding; the extra copies are the agent files and skills added since, and merging them is outside this slice's no-behavior-change scope, so it is named here.

## Dead code

The project configuration (`justfile`, `.github/workflows/verify.yml`) has no unused-code tool or baseline, so none is claimed. A name search of the exports the epic added (`bench.mjs`, `drive.mjs`, `packet.mjs`, `project-verify.mjs`) found nine referenced nowhere outside their own file: `implementerChecks`, `readTree`, `isTestFile`, `gradeTask`, `summarizeImplementer`, `compareImplementerResults`, `renderImplementerResults`, `runImplementerBench` and `acceptanceCriteria`. This PR drops only their `export` keyword; behavior is unchanged and there is no baseline to grow. No dead file or fixture remains: every file under `docs/implementer-benchmark/` is read by the bench, and the profile references are loaded by language name.

## Gate and CI timing

No project configuration records local gate times, so local before and after times are unavailable and no local win is claimed. CI step times from the `verify.yml` runs (whole seconds), `just unit` / manifests verification / Gitleaks:

| | Run | Linux unit | macOS unit | Gitleaks (Linux, macOS) |
| --- | --- | --- | --- | --- |
| Before (epic start, #768 merge `706b970f`) | [44650567574](https://github.com/FilipKrawiec/skills/actions/runs/44650567574) | 39 s | 99 s | 4 s, 5 s |
| After (#782 merge `dd9d6f02`) | [45268692995](https://github.com/FilipKrawiec/skills/actions/runs/45268692995) | 43 s | 89 s | 3 s, 2 s |

Manifests verification takes under 1 s in both. The unit step moved in opposite directions on the two runners (+4 s Linux, -10 s macOS) while the suite grew by the bench tests, which is runner variance on one sample per side. No gate change targeted speed, so no measured win is claimed and none is made.

## Preloaded skill text per drive role

Words of the agent file plus the `SKILL.md` of each skill its `skills:` list preloads (`wc -w`, whole files including front matter).

| Role | Preloads before (v11.110.0) | Words before | Preloads after | Words after |
| --- | --- | --- | --- | --- |
| implementer | agent 175 + `deliver` 840 + `tdd` 631 | 1646 | agent 174 + `tdd` 763 | 937 |
| planner | agent 440 + `spec` 827 + `plan` 827 | 2094 | agent 440 + `spec` 828 + `plan` 685 | 1953 |
| Reviewer | agent 147 + `review` 848 | 995 | agent 147 + `review` 848 | 995 |
| devops | agent 195 | 195 | agent 195 | 195 |
| improver | agent 231 + `improve` 700 | 931 | agent 231 + `improve` 700 | 931 |
| conflict-resolver | agent 165 | 165 | agent 165 | 165 |

The implementer no longer preloads dispatch steps (-709 words, -43 percent); its implement step is read from `deliver/references/implementer.md` when drive's brief names it. The planner no longer preloads plan scoring and approval (`plan` -142 words, moved to `plan/references/approval.md`), -141 words overall. The other four roles are unchanged by the epic. The implementer's `tdd` grew by 132 words for the red-run report and the one doubles rule; the net is still a large cut.

## Implementer bench

`workflow bench --implementer --run --baseline v11.110.0 --out docs/records/2026-11-23-implementer-bench-775-results.json` ([result JSON](2026-11-23-implementer-bench-775-results.json)): `sessionFor('implementer', 'R0')` (sonnet, low effort), two seeded TypeScript tasks, skills at the working tree against the skills at `v11.110.0`. Exit 0, no task skipped, total cost $0.67 of the 10 USD cap.

| Arm | layers | primitives | red | gate | Overall | Cost per task | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| after the epic (working tree) | 2/2 | 2/2 | 2/2 | 2/2 | 8/8 | $0.16 | $0.31 |
| before the epic (v11.110.0) | 2/2 | 2/2 | 2/2 | 2/2 | 8/8 | $0.18 | $0.36 |

Verdict: **cost per task is lower ($0.16 against $0.18); the pass rate is not higher, so the "higher pass rate" clause is not met.** The shortfall is the ceiling the [baseline record](2026-11-23-implementer-bench-baseline.md) named: both arms pass every check on both tasks, so the two seeded tasks cannot separate the wordings. The same 8/8 appears in the [#772](2026-11-23-implementer-bench-772.md) and [#773](2026-11-23-tdd-doubles-bench.md) records. The $0.02 cost gap is two tasks per arm and may be run-to-run noise; the lower figure is consistent with the 43 percent smaller implementer preload but does not prove it. Harder seeded tasks are the follow-up below.

## Delivery flow

| PR | Opened to merged | Reviewer sessions and cost | Notes |
| --- | --- | --- | --- |
| #776 | 5 m 48 s | 1, $0.55 | none |
| #777 | 14 m 37 s | 1, $1.04 | none |
| #778 | 9 h 57 m | 2, $0.79 + $0.68 | 9 h 37 m between the fix commit (10:55Z) and the bench-record commit (20:32Z); the PR does not say what the slice waited on |
| #781 | 18 m 59 s | 2, $0.69 + $0.44 | none |
| #782 | 18 m 17 s | 3, $0.61 + $0.48 + $0.41 | two Reviewer comments before approval |

No PR received a changes-requested review and no owner step interrupted the epic. Reviewer cost per PR, summed over its sessions, is $0.55, $1.04, $1.47, $1.13 and $1.50 (median $1.13). Implementer rows exist on every PR but carry `cost: null` and `effort: unreported`, so per-PR and per-epic cost cannot be summed beyond the Reviewer.

Two improvements, each with its evidence (drive or the owner files them; the implementer opens no issues):

1. **Harder seeded implementer tasks.** Four bench runs (baseline, #772, #773, this one) all score 8/8 in both arms; the bench therefore cannot show any skill edit beats the run without it, which the epic's Measured criterion and `references/evaluating.md` require. Add tasks on which the previous skills fail a check (for example a Dart or Java task, or a task needing an invariant on external state) before the next change to `ddd`, `hexagonal-architecture` or `tdd`.
2. **Report implementer cost.** All six implementer usage rows on #776, #777, #778, #780, #781 and #782 show `cost: null`; only Reviewer cost can be summed. This continues #659 (per-role cost comparison carried from the #635 measurement), so it is a comment there rather than a new issue if `issue create --check` matches.
