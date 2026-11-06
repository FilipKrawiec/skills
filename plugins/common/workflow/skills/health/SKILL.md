---
name: health
description: Use when completing bounded maintenance after a product milestone, including stable upgrades, migrations and confidence evidence before the next product.
allowed-tools: Read Edit Bash
---

# Health

## 1. Bound the work

After production acceptance, create or reuse a linked native health milestone using the project's naming convention. Inventory dependencies, toolchains, actions, justified refactoring, testing gaps and speed within approved maintenance constraints. Record bounded slices, acceptance, gates and stop conditions. Freeze the latest stable direct targets at the start, including majors, with release and compatibility evidence; queue later versions unless urgent security requires reassessment.

**Exit gate:** dated targets, compatibility evidence and bounded slices recorded.

## 2. Migrate

Implement and verify each target and migration, including transitive compatibility, while preserving user behavior. Finish required migrations before the next dependent product milestone; a time or size limit does not waive them. When upstream does not support the target combination, record authoritative evidence, the newest compatible stable combination and revisit condition. An external outage permits deferral only when an independent product's delivery and safety do not depend on it; record evidence and the resumption trigger. Difficulty alone is not an exception.

Use independent review and configured delivery controls. Production promotion needs separate owner approval.

**Exit gate:** required targets complete, or supported exception, outage deferral or reserved decision recorded.

## 3. Preserve confidence

Run configured reproducible coverage, mutation and complexity/risk gates, stricter for changed and critical behavior; use `tdd` mutation sampling when no mutation tool is configured. Missing measurements are not passes. Lower thresholds, narrower scope, new exclusions or reset baselines need explicit owner approval with impact evidence. Record revision, commands, toolchain, scope, seed, results and environment; compare timing only across equivalent runs.

Request a `review` area audit of areas changed by the product milestone and file verified Important findings in the health milestone. Improve tests or structure for demonstrated risk or measured maintenance cost, not counts alone; preserve meaningful behavior when removing redundant tests.

**Exit gate:** project confidence gates pass without unapproved weakening, or missing evidence and next action named.

## Output

At most 8 lines: **Summary:** targets, migrations, exceptions and confidence/timing evidence with commands/exits. **Decision:** next action/actor, prerequisite or reserved options and recommendation.
