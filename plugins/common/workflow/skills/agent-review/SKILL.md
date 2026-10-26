---
name: agent-review
description: Use when an orchestrator assigns binding GitHub PR review under configured Reviewer protection, technical adjudication, or AFK eligibility review where reviewerLanes is enabled.
allowed-tools: Read Bash(git:*,gh:*)
---

# Agent Review

Read base-branch `.github/lanes.json`: owner, implementer, reviewer, ownerPaths, ownerLabels, reviewerPins, reviewRounds (default 3), alwaysInScope, reviewerLanes and reviewQueue. Act as Reviewer; never implement, commit or push. The orchestrator dispatches workers and advances phases. Post only authorized decisions, reviews, replies, thread resolutions and queue updates.

Separate judgment, identity and secrets: a fresh native subagent judges, needing no GitHub credential or separate machine. Posting uses the configured reviewer identity through an existing authorized credential mechanism. Craftsman must never exercise that identity. A shared store proves no secret isolation. Never use the owner's token as a fallback. Missing posting/protection capability blocks merge, not code analysis or preparation; report the precise gap; start no infrastructure work.

## 1. Adjudicate a fork

For a technical fork, read intent, criteria, options and evidence. Decide routine engineering within approved constraints, including dependency major migrations. Never reverse owner decisions, add paid services, exceed budgets or weaken authority/quality gates. Record the choice, reason and any within-intent packet correction on the issue; preserve other assignments. Only `spec` owns lane transitions; return authorized corrections to the orchestrator. Then return; skip PR review.

When assigned issue-level AFK eligibility and `reviewerLanes` is true, evaluate readiness using `spec` and its criteria; record `APPROVED AFK` or `REQUEST_CHANGES` with evidence on the issue. Return it to the orchestrator for the `spec` transition; never change labels or board status.

**Exit gate:** linked technical decision or exact reserved question/wait, options and recommendation.

## 2. Inspect the exact change

For a queue pass, select at most four ready PRs, oldest first; skip drafts. For an assignment, inspect it. Capture author/pusher, base/head, criteria, scope, checks, threads and rounds. At reviewRounds, require diagnosis/replan, not approval by exhaustion.

Consume the orchestrator's fresh A/B `review` verdicts for this exact base/head, blocking findings confirmed by a fresh `review` verifier. If any is absent or stale, return that requirement; do not dispatch workers. Independently check the head/evidence before the binding decision.

```text
Load review; judge only axis <A|B>. No edits, posting or dispatch.
Intent/authority: <repo, milestone/issue, approved revision/source>.
Criteria/direction: <acceptance, prototype/pattern, reserved decisions>.
Scope: <paths/tests, exclusions, dependencies, preserved edits>.
Checkout: <worktree>; base <ref/SHA>; head <branch/SHA>; last reviewed <SHA|none>.
Evidence: <diff command, commands/exits, captures, prior findings/repairs>.
Return <=8 lines: APPROVED or REQUEST_CHANGES; confirmed file:line
findings/scenarios; optional suggestions separately; base/head,
commands/exits, missing evidence and next action/actor. Stop if head moves.
```

Independently verify corrections and agent-thread resolutions against the new head. Human threads stay theirs. Missing criteria/evidence or scope violations require repair/refinement, not routine transfer to the owner.

**Exit gate:** both axes and corrections evaluated at the same exact base/head.

## 3. Record the merge decision

Blocking findings require REQUEST_CHANGES, even at the round limit. Clean eligible work requires APPROVE from the configured reviewer identity, never a comment. Check `gh api user --jq .login`; require reviewer identity distinct from PR author and latest pusher. Never fabricate attribution. Record the exact `commit_id` in API reviews.

Additional owner approval is required for:

- Explicit owner review, unknown author, no files or at least 3000 files.
- `ownerPaths` (both rename paths), `ownerLabels`, or, even if unlisted, `.github/workflows/`, `.github/CODEOWNERS` or `.github/lanes.json`, so agents never loosen their own gates. The path hold alone lifts for a `reviewerPins` author's PR whose only change there repins actions to their tag commits (`gh api repos/<action>/commits/<tag>`), released 7+ days ago. Size alone never holds a PR; `ownerLines` only sizes slices. A CODEOWNERS match is the Reviewer gate, not an owner hold.
- Owner-reserved effects: strategy, cost, authority or weakened gates. Product choices are `spec` decision records.

Approved health major upgrades alone do not require the owner. Owner approval supplements, never replaces, Reviewer APPROVE. For reserved work record `review:owner` and the exact extra decision. If an owner-only CODEOWNERS match means the configured Reviewer is not the effective required owner, report a protection gap and keep merge disabled; an owner approval or procedural Reviewer approval cannot satisfy the missing native Reviewer gate. Remove only your own obsolete hold, never an explicit owner request.

Before approval, verify branch protection requires code-owner review and the configured Reviewer is sole owner for every changed path on the base branch. Otherwise keep merge disabled and report the gap. Recheck head and checks after posting; a changed head needs fresh review. Never dismiss blockers or approve your own PR.

Post `<!-- agent-review sha=<HEAD> round=<N> verdict=<ready|owner|fixes|rounds> -->`, matched rule, findings, evidence and attribution. Return the recorded decision to the orchestrator for VCS reconciliation; production approval remains separate.

**Exit gate:** binding exact-head review, additional owner hold, or explicit repair/capability wait.

## 4. Queue and report

With reviewQueue, read [queue.md](references/queue.md). Wake runners only through caller-authorized mechanisms; failed wakes retain retry conditions. Never recursively invoke AFK.

**Exit gate/output:** queue and next actor recorded. <=8 lines: **Summary:** linked verdicts, exact heads, commands/exits and waits. **Decision:** next action/actor or reserved options/recommendation. Notify only through the authorized configured channel.
