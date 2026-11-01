---
name: afk
description: Use when asked to run an unattended AFK issue or explicitly requested to use AFK in a repository with .github/agent-workflow.json.
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*,lsof:*)
---

# AFK

Deliver the requested authorized slice, or one unattended slice per run. Read `.github/agent-workflow.json` from the configured base (default `main`). Never change the main checkout. When the owner explicitly invokes AFK interactively, work on their requested items; do not pick unrelated queue work.

Read [setup.md](references/setup.md) only when enabling or scheduling runs, and [github-safety.md](references/github-safety.md) only when checking GitHub protection.

## 1. Establish work

Check the actual base head and required checks once. Invoke `ship` for a failed base or merged work requiring follow-up; do not repeat a healthy-base scan at the same head. If required checks are failed, missing or pending, record the wait and next actor; do not select or deliver new work until base is green. Read the issue's authorization, criteria, scope, dependencies, recorded decisions and applicable milestone. Reuse applicable decisions unless evidence or intent changed.

Routine engineering within approved scope is delegated. New interaction direction, changed product intent, new paid services, increased budgets, authority changes and exact production approval remain with the owner. Do not infer authority from a board status. Preserve existing work and never hold an issue twice.

**Exit gate:** authorized slice and green base, or a recorded wait and next actor.

## 2. Select or resume

Reconcile owned open PRs and their issues before selecting new work; repair confirmed blockers within scope. Keep a visible wait with a retry condition when needed. For unattended selection, choose an open `lane:afk` issue with criteria and scope, excluding epics, active claims, unmet dependencies and issues mentioned in any open PR body. Run `gh pr list --state open --limit 1000 --json number,body`; wait if incomplete. Verify each dependency's required outcome; a closed issue alone is not proof. Rank earliest milestone, board priority or priority label, then issue number. Never stack a PR on an unmerged parent.

Use enforced claims when available; otherwise serialize. Re-read claims before and after recording `state:claimed`; stop on conflict, including an uninvestigated stale claim. `spec` defines transition semantics; the named actor applies each transition and the orchestrator moves board status. Shared files do not block independent work; the later PR resolves conflicts.

**Exit gate:** resumed PR, exclusive assignment, or queue empty/wait reason.

## 3. Deliver

Invoke the skills for implementation, review, VCS and binding GitHub approval. Respect the repository's pre-push gate and required hosted checks; do not duplicate a full suite locally unless required or needed to diagnose a failure. Every changed or untracked path must be in the scope packet or `alwaysInScope`. The author cannot approve their own work. Verify criteria, scope, owner decisions and prior findings against authoritative records; generated review context may omit information. Keep GitHub approval bound to the actual head, while reusing unchanged evidence or reviewing only the delta as `review` permits. Pending CI does not prevent a clean review; it remains a merge gate.

Delegate only when needed for independence or parallel work. Use fresh minimal context where supported, with all relevant criteria and evidence; never omit applicable decisions. Give each worker this complete brief:

```text
Intent: <issue, approved outcome and assigned phase>.
Criteria and scope: <acceptance, paths, exclusions, dependencies, claim>.
Checkout: <worktree, base/head SHAs, last reviewed SHA>.
Decisions and evidence: <applicable choices, prior findings, checks and captures>.
Load <skill>; do only the assigned phase. Preserve edits; do not dispatch,
approve your own work, promote or expose credentials. Return paths, head,
commands/exits, findings, exit gate and decisions in at most 8 lines.
```

**Exit gate:** reviewed PR with exact-head evidence, or a bounded failure record.

## 4. Recover and close

Trace a failure and attempt at most two evidence-led fixes, then replan or wait with cause, responsible actor and retry condition. Retain the lane; technical difficulty alone is not an owner decision. Request technical adjudication only for an unresolved conflict or changed evidence. Only an owner-reserved decision waits on the owner. Invoke the owning skills for lessons and safe cleanup. At a bounded health stop, retain unfinished required migrations as prerequisites.

**Exit gate:** delivery or recorded replan/wait; lane retained unless authority changed.

## Output

At most 8 lines: **Summary:** delivery, commands/exits, evidence and waits. **Decision:** next action/actor or reserved choices and recommendation. Update the configured queue; notify only through its authorized channel.
