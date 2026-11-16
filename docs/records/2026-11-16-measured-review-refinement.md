# Measured, deterministic review: epic refinement

Review of the merged epic [#560](https://github.com/FilipKrawiec/skills/issues/560) (refinement [#581](https://github.com/FilipKrawiec/skills/issues/581)). Slices: #565 (PR #567, fact packet and usage), #563 (PR #570, Opus review, advisory AGY, scope check, owner-pinned decisions), #569 (PR #572, fixed per-PR overhead), #582 (PR #585, reviewer benchmark), #583 (PR #584, epic repair). The planner PRs #574-#580 belong to another epic and are counted only as later clean PRs. All figures come from the PRs' `workflow:usage` comments, `gh pr list` timestamps and Actions step timestamps; none are estimated.

## Review against the Outcome

Each Outcome clause is delivered and pinned: per-session usage in a PR comment, the review packet in `lib/packet.mjs`, owner-owned decisions in `scripts/tests/workflow-decisions.test.mjs` with a CODEOWNERS entry for the owner, Opus at every risk with AGY advisory, scope-packet enforcement in drive, retry-safe posting and the benchmark. No finding needs a fix and no recorded Nit, alias, shim or naming clash is open; the planner-epic export `consolidatedMarker` was already removed by #575.

## Dead code

The project configuration (`justfile`, `.github/workflows/verify.yml`) has no unused-code tool or baseline, so none is claimed. A name search of every export in `plugins/common/workflow/scripts` found eight epic-era exports referenced nowhere outside their own file: `parseCodeowners`, `validateDelivery`, `outOfScopePaths`, `uncoveredCriteria`, `packetLimits`, `usageBaseline`, `existingFindingKeys` and `RELEASE_BRANCH`. This refinement drops only their `export` keyword, so behavior is unchanged and no baseline exists to grow. No dead file or fixture was found. Older exports with no outside reference (`validateWorkflowSteps`, `discoverGithubMetadata`, `expandedPath`, `dependencyStatus`, `maxRisk`, `freshFixRound`, `waitCommandFor`, `prBody`, `slugBranch`, `driveIssue`, `driveEpic`, `checkLockDirectory`, `nitsSwept`, `backupWorktree`) predate the epic and are left alone.

## Gate and CI timing

No tool in the project configuration records local gate times, so local before and after times are unavailable. CI step timestamps (whole seconds), `just unit` / manifests verification / hygiene / Gitleaks:

| | Run | Unit | Manifests, hygiene | Gitleaks | Job |
|---|---|---|---|---|---|
| Before (epic start) | [#567 merge](https://github.com/FilipKrawiec/skills/actions/runs/43840650029) | 34 s | <1 s | 3 s | 42 s |
| After (latest main) | [#585 merge](https://github.com/FilipKrawiec/skills/actions/runs/43892093228) | 25 s | <1 s | 2 s | 31 s |

The after run is faster although the suite grew, which points to runner variance, since no gate or test change in this epic targeted speed. One sample per side cannot separate the two, so no measured win is claimed and no gate change is made.

## Delivery flow

| PR | Opened to merged | Reviewer sessions | Reviewer cost |
|---|---|---|---|
| #567 | 3 m 11 s | unreported | unreported |
| #570 | 20 m 18 s | 4 | $1.21 (sonnet) |
| #572 | 18 m 12 s | 4 (3 fix rounds, 4 commits) | $2.22 |
| #584 | 3 m 57 s | 2 | $0.88 |
| #585 | 10 m 53 s | 3 (1 fix round) | $1.59 |

No owner step or block interrupted the epic. Rework was concentrated in #570 and #572, the two large guardrail slices (3 fix rounds on #572). Two improvements, each with its evidence:

1. **Reviewer approval is a second session.** Every clean or near-clean PR after #572 records two reviewer usage entries: #574 $0.93 then $0.37, #580 $0.82 then $0.29, #584 $0.53 then $0.35. The second is the approval at the green head, whose body says "my earlier round-1 verdict stands". #569 aimed to remove the approval-only session; only the risk sessions went. Drive can post the approval itself through the Reviewer identity when the last verdict is `ready` at the same head and CI is green, saving about $0.29-0.37 and a launch per PR.
2. **Only reviewer usage is recorded.** All of the usage comments above list a reviewer row and none an implementer, risk or planner row, so per-PR totals understate cost and epic cost cannot be summed. Drive should record each session it launches, or "unreported" where the host gives no figures, as #560's first criterion requires.

Neither is filed from this PR: the implementer may not open issues, so drive or the owner files them from this section.

## Usage before and after the packet

The packet shipped in #567. Usage recording shipped with it, so no per-PR cost exists for reviews before the packet except the dry-run baseline (Opus, no packet, verdict only, $0.21-0.46 per review). Before: #568 `sonnet`, unreported. After (reviewer cost per PR, Opus unless marked): #570 $1.21 (sonnet), #572 $2.22, #574 $1.30, #575 $1.13, #577 $1.24, #580 $1.11, #584 $0.88, #585 $1.59.

## Benchmark before and after

Before (2026-11-16 dry run, Opus without a packet, the harness is not in the repository): Opus caught 2 of 3 known defects at $0.21-0.46 per review, Argon 1 of 3, Gemini Flash approved two PRs with known defects, and no reviewer caught #539's reversal of delta-only rounds.

After (packet era, one `workflow.mjs bench --run` on Opus over [`docs/review-benchmark.json`](../review-benchmark.json), run by the owner's approval): caught 2 of 3 known defects, 1 false positive on 5 known-clean PRs, total $3.70, mean $0.46 per review, 0 unreported.

| PR | Kind | Verdict | Result | Cost |
|---|---|---|---|---|
| #539 | defect | fixes | caught | $0.34 |
| #555 | defect | fixes | caught | $0.81 |
| #500 | defect | ready | missed | $0.27 |
| #568 | clean | ready | clean | $0.43 |
| #559 | clean | ready | clean | $0.64 |
| #540 | clean | ready | clean | $0.24 |
| #526 | clean | fixes | false positive | $0.44 |
| #478 | clean | ready | clean | $0.53 |

Compared with the dry run: the catch rate is unchanged (2 of 3), the mean cost per review ($0.46) sits at the top of the dry-run $0.21-0.46 range, and #539's reversal, which no dry-run reviewer caught, is caught with the packet. The #500 miss (nested epic descendants) and the #526 false positive remain. The sets are not identical (the dry-run PRs were reconstructed, and 8 PRs is a small sample), so this shows no packet regression in catches or cost rather than a measured gain. The result JSON is not committed: the repository has no results location, only the snapshot.

## Packet review cost

PR #572 round 1 cost $0.92: 32 input, 8,936 output, 815,729 cache-read and 72,633 cache-write tokens. Later rounds on the same PR cost $0.42-0.44 with 375k-422k cache-read tokens. Round-1 reviews on this epic's later PRs cost $0.44-$0.93, mean $0.66 (#574 $0.93, #575 $0.44, #577 $0.55, #580 $0.82, #584 $0.53, #585 $0.70).

- **Not diff size.** #572 changed 99 lines and cost $0.92; #574 changed 291 lines and cost $0.93.
- **Turns times context.** The cache-read figure is every tool turn re-reading the packet and brief, and a first round also verifies each criterion and posts a long verdict (8.9k output tokens, the largest single cost after cache). Rounds 2 and later are delta-only and cost about half.
- **Not like for like.** The $0.21-0.46 dry-run figure is one verdict with no posted threads, usage comment or approval; the recorded figure includes the Reviewer's real work.
- **Cannot be isolated.** No Opus review without the packet but with the real Reviewer exists, so the packet's share cannot be measured; the benchmark run above would give it.

Accepted, with this reason: the cost sits within the epic's $0.44-$0.93 round-1 range, is driven by verification turns rather than the packet's size, and no measurement shows a cheaper packet that keeps catches. Revisit it with the benchmark run.

## Before and after #569

| | Opened to merged | Reviewer sessions | Reviewer cost |
|---|---|---|---|
| Before (#570, #568, #567) | 20 m 18 s, 19 m 48 s, 3 m 11 s | 2 (verdict, approval-only) | unreported |
| After (#574, first clean PR) | 5 m 22 s | 2 (round-1 verdict, then approval) | $1.30 |

The delivery record `docs/delivery-session-counts.md` holds the same figures.
