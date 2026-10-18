---
name: health
description: Use when completing bounded autonomous maintenance after each product milestone, including stable upgrades, migrations and confidence evidence before the next product.
allowed-tools: Read Edit Bash
---

# Health

## 1. Bound the iteration

After production acceptance of each product milestone in the target repository, autonomously inspect dependencies, toolchains, automation actions and confidence evidence within the approved maintenance constraints. Record a bounded scope and acceptance criteria, then defer new discoveries. Use project resource/retry limits and stop conditions; a time limit does not waive required migrations. Freeze the latest stable versions available at iteration start, including major versions of direct dependencies, toolchains and actions. Record registry/release evidence and resolve transitive compatibility. Do not chase versions arriving later; queue them for the next iteration unless urgent security requires immediate reassessment.

**Exit gate:** dated target inventory, compatibility evidence and bounded slices recorded.

## 2. Complete upgrades and migrations

Implement each target and its migration in bounded slices; preserve user behavior and verify real compatibility, including transitive dependencies. Finish required migrations before the next product milestone. Do not leave an indefinite partially migrated state.

When upstream does not support the target combination, record authoritative compatibility evidence and choose the newest compatible stable combination as an explicit exception with a revisit condition. Difficulty alone is not an exception. An external outage may defer blocked health work and allow an independent product milestone only when its delivery and safety do not depend on that work; record the outage evidence, dependency reasoning and resumption trigger. Split large migrations into further bounded slices; size alone requires no owner decision. Escalate only a reserved decision; do not silently waive the prerequisite.

Use host-dispatched leaf work with exact targets, owned files, acceptance, commands, isolation and stop conditions; workers do not redispatch. Keep review independent of implementation and isolate production credentials from both. Do not invoke an orchestration cycle.

**Exit gate:** targets and migrations complete with passing evidence, or explicit supported exception/outage deferral or owner blocker.

## 3. Preserve confidence

Run reproducible project mutation, coverage and risk gates, stricter for changed and critical behavior. Ratchet measured confidence: weakening thresholds, narrowing scope, adding exclusions or resetting a baseline requires explicit owner approval with evidence of the impact. Missing measurements block completion. Record command, revision, toolchain, scope, seed, results and environment; compare timing using equivalent environments, scope and warm/cold conditions. Treat an incomplete measurement as missing evidence, not a pass.

Improve tests or structure for demonstrated risk, maintenance cost or measured regression. Do not force churn merely to increase test counts, scores or upgrade activity. Verify preserved meaningful behavior when deleting redundant tests. The host arranges the applicable delivery controls for the resulting exact artifact; health does not authorize production promotion.

**Exit gate:** reproducible confidence and comparable timing evidence pass project gates; no unapproved weakening.

## Output

Session replies ≤5 lines; run reports ≤8. **Summary:** frozen targets, completed migrations, exceptions, confidence/timing evidence, commands and exits. **Decision:** next-product prerequisite or recommended owner action, otherwise “Nothing needed.”

```text
Summary: frozen stable targets installed; migration complete; verify exit 0.
Confidence: configured gates pass; timing 42s vs 43s, same runner/scope.
Decision: Nothing needed; next product prerequisite cleared.
```
