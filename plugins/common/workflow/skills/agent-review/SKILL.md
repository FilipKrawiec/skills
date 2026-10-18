---
name: agent-review
description: Use when a scheduled task asks for one unattended review pass over open PRs, or an AFK run or refinement asks the reviewer to decide a fork, in a repository whose .github/lanes.json turns on agentReview. Never for an owner's own interactive review.
allowed-tools: Skill Read Bash(git:*,gh:*)
---

# Agent Review

Read `.github/lanes.json`: owner, implementer, reviewer, ownerPaths, ownerLabels, ownerLines (default 800), reviewRounds (default 3), alwaysInScope and reviewQueue. Never implement, commit or push. Post only authorized decisions, reviews, replies, resolutions, queue updates and auto-merge requests.

The host must provide a fresh reviewer context and reviewer credentials inaccessible to the craftsman. Account selection from a shared token store is not isolation. If isolation is unavailable, withhold approval and report the capability gap. The host owns model routing and claims. Serialize until capability is proven; parallel assignments require enforced disjoint scopes including tests and dependencies. Keep dispatch depth at most two without cycles; have the host assign review axes as leaves.

## 1. Adjudicate a technical fork

When given a fork, read intent, criteria, options, recommendation and evidence. Decide routine engineering within approved milestone constraints; prefer the recommendation unless evidence contradicts it. Never reverse owner decisions, add a paid service, exceed budgets, alter product intent, cross owner paths or approve production. New interactions await owner prototype direction.

A necessary packet expansion must remain within intent and outside enforced active scopes. Record the choice, reason and updated criteria/packet on the issue. Change lanes only under configured reviewerLanes authority; failure alone retains its lane. Return a reserved owner decision with options and recommendation, or an evidence-led replan/wait. Never substitute repeated review for bounded diagnosis.

**Exit gate:** `decided: <choice>` and evidence link, or reserved decision/capability wait.

## 2. Collect and inspect

Select at most four ready PRs, oldest updated first. Capture base and head SHAs, issue criteria, unresolved threads, current checks and previous rounds. Skip drafts. Reuse a verdict only for the identical head with still-valid evidence. At reviewRounds, stop repetitive retries and record diagnosis/replan/wait; do not grant approval by exhaustion.

Have the host dispatch each axis with this complete leaf brief:

```text
Intent: <milestone/issue URLs and outcome>.
Criteria: <criteria, prototype decision and reserved approvals>.
Scope: review axis <A|B>, <paths including tests>, <dependencies/exclusions>.
Checkout: <worktree>; base <ref + SHA>; head <branch + SHA>.
Decisions: <approved constraints and unresolved technical questions>.
Evidence: <diff command, check commands/exits, captures, prior findings>.
Use review's assigned axis only; no dispatch, edits or external posting.
Verify unresolved threads against code. Return APPROVED or REQUEST_CHANGES,
confirmed file:line findings/scenarios, suggestions separately, commands/exits,
head SHA and remaining decisions in at most 8 lines.
```

**Exit gate:** confirmed findings for an unchanged exact head.

## 3. Post the verdict

Reserve owner approval when the PR matches any of these rules:

- Explicit owner review, unknown author, no files or at least 3000 files.
- CODEOWNERS/ownerPaths (both rename paths), ownerLabels, or code over ownerLines.
- Dependabot major update, or minor update below 1.0.
- Code without a closing issue's packet, or outside packet/alwaysInScope without authorized adjudication.

Docs, tests, manifests and lockfiles from Dependabot do not count as code for the last two code limits. Owner paths and product/production authority still apply.

Blocking findings require REQUEST_CHANGES, including at the round limit; optional suggestions never force fixes. Clean reserved work gets COMMENT and review:owner. Otherwise APPROVE only the captured head with valid required checks, no unresolved blockers and an independent author/reviewer. Never approve your own PR.

Post marker `<!-- agent-review sha=<HEAD> round=<N> verdict=<ready|owner|fixes|rounds> -->`, matched rule, confirmed findings, evidence and attribution. Reply with fixing commits; resolve only agent threads whose fixes were independently verified. Recheck head and checks immediately before approval; head movement invalidates it.

**Exit gate:** review tied to exact head, or stale evidence wait.

## 4. Merge and queue

For eligible approved heads, request `gh pr merge <pr> --squash --auto --match-head-commit <head>`; required protection must still hold. Never treat merge approval as production approval.

With reviewQueue, read [queue.md](references/queue.md) to update it. Wake runners only through caller-authorized mechanisms; never recursively invoke AFK. Report failed wakes with a retry condition.

**Exit gate:** auto-merge/check state and queue recorded.

## Output

At most 8 lines: **Summary:** linked verdicts, exact heads, commands/exits and waits. **Decision:** reserved choices with options/recommendation, or “Nothing needed.” Daily changed digest and immediate incidents/all-work-blocked notices use only the authorized configured notification channel.
