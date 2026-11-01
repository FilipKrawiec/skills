---
name: afk
description: Use when asked to run an unattended AFK issue or explicitly requested to use AFK in a repository with .agents/config.json.
allowed-tools: Skill Read Edit Write Bash(git:*,gh:*,node:*,just:*,lsof:*)
---

# AFK

Deliver the requested authorized slice, or one unattended slice per run. Read `.agents/config.json` from the configured base (default `main`). Never change the main checkout. When the owner explicitly invokes AFK interactively, work on their requested items; do not pick unrelated queue work.

Read [setup.md](references/setup.md) only when enabling or scheduling runs, and [github-safety.md](references/github-safety.md) only when checking GitHub protection. Use `safety check` for read-only inspection. Run `safety apply` only after an explicit owner instruction; it changes repository permissions and branch protection. Identities, repository and required checks come from `.agents/config.json`.

## 1. Establish work

Check the actual base head and required checks once. Invoke `ship` for a failed base or merged work requiring follow-up; do not repeat a healthy-base scan at the same head. If required checks are failed, missing or pending, record the wait and next actor; do not select or deliver new work until base is green. Read the issue's authorization, criteria, scope, dependencies, recorded decisions and applicable milestone. Reuse applicable decisions unless evidence or intent changed.

Routine engineering within approved scope is delegated. New interaction direction, changed product intent, new paid services, increased budgets, authority changes and exact production approval remain with the owner. Do not infer authority from a board status. Preserve existing work and never hold an issue twice.

**Exit gate:** authorized slice and green base, or a recorded wait and next actor.

## 2. Select or resume

For AFK, use the CLI's `Hold:`/`Work:` output as the full assignment; take no second item. A foreground one-shot watcher owns holds; don't call `afk start`/`end`. Background hosts manage holds. The CLI selects eligible AFK/proposed issues and PRs needing review or repair, respecting blockers, claims and live holds. It prioritizes by board priority, then milestone and number; missing Project scope skips board metadata only. The default concurrency is four; it splits epics by issue and holds an epic only when no sub-issue is eligible. Owner-requested issues use `afk start --me ID --issue NUMBER`.

Use the workflow CLI for assignments and issue writes; it validates the actor and serializes claims. Post reports with `issue comment --number N --body-file PATH` using a single-link file inside the worktree; outside paths, escaping symlinks and hard links are rejected. Close passing issues with `issue close --number N`. Invoke `spec` for transitions.

**Exit gate:** resumed PR, exclusive assignment, or queue empty/wait reason.

## 3. Deliver

Invoke the skills for implementation, review, VCS and binding GitHub approval. When assigning agents, use `afk.agentModels` for the matching `product`, `implementer`, `delivery`, `reviewer` or `reviewFix` role; apply `reviewFix.fromRound` to escalation. Pass model and reasoning effort when the host supports them. Respect the repository's pre-push gate and required hosted checks; do not duplicate a full suite locally unless required or needed to diagnose a failure. Every changed or untracked path must be in the scope packet or `alwaysInScope`. The author cannot approve their own work. Verify criteria, scope, owner decisions and prior findings against authoritative records; generated review context may omit information. Keep GitHub approval bound to the actual head, while reusing unchanged evidence or reviewing only the delta as `review` permits. Pending CI does not prevent a clean review; it remains a merge gate.

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
