---
name: afk
description: Use when asked to run an unattended AFK issue or explicitly requested to use AFK in a repository with .agents/config.json.
allowed-tools: Skill Read Edit Write Bash(git:*,gh:*,node:*,just:*,lsof:*)
---

# AFK

Deliver the requested authorized slice, or one unattended slice per run. Read `.agents/config.json` from fetched `origin/HEAD` for identities and step scripts. Never change the main checkout. When invoked interactively by the owner, work only on their requested items.

Read [setup.md](references/setup.md) only for scheduling, and [github-safety.md](references/github-safety.md) only for GitHub protection. Use `safety check` for inspection; run `safety apply` only on explicit owner instruction.

## 1. Establish work

Check base head and required checks once. Invoke `ship` for a failed base or merged work needing follow-up; do not rescan a healthy unchanged head. If checks are failed, missing or pending, record the wait and next actor; deliver no new work until base is green. Read the issue's authority, criteria, scope, dependencies, decisions and milestone; reuse decisions unless evidence or intent changed.

Delegate routine work within scope. New product direction, paid services, increased budgets, authority changes and production approval remain with the owner. Board status grants no authority. Preserve existing work; never hold an issue twice.

**Exit gate:** authorized slice and green base, or a recorded wait and next actor.

## 2. Select or resume

For AFK, the CLI's `Hold:`/`Work:` output is the assignment; take no second item. Owner requests use `afk start --me ID --issue NUMBER`.

Use the workflow CLI for assignments and issue writes; it validates actors and serializes claims. Post via `issue comment --number N --body-file PATH`, using a single-link file inside the worktree. Close passing issues with `issue close --number N`; invoke `spec` for transitions.

**Exit gate:** resumed PR, exclusive assignment, or queue empty/wait reason.

## 3. Deliver

Invoke the skills for implementation, review, VCS and binding GitHub approval. When the host supports it, run review, and fixes after a `round=2`-or-later `verdict=fixes`, on its strongest model at high effort, since cheaper fixes reintroduced blockers; run other agents on its standard model. Respect the pre-push gate and required hosted checks; run a full suite locally only when required or diagnosing a failure. Every changed or untracked path must be in the scope packet. Verify criteria, scope, owner decisions and prior findings against authoritative records, not generated review context. Keep GitHub approval bound to the actual head, while reusing unchanged evidence or reviewing only the delta as `review` permits. Pending CI blocks merge, not a clean review.

Follow **Process → Assemble → Test**. Process the issue and plan with the invoked skills; `steps.process` is `null` because the workflow owns this phase. Assemble the authorized change; run `steps.assemble` with `{platform}` when previewing the app (`null` means no project assembly command applies). Run `steps.test` as configured; substitute only placeholders present in its argv, since a project script may discover changed tests itself. For an explicitly read-only workflow check, use CLI evidence to test its acceptance criteria; skip project assembly and code tests unless the issue asks for them. Run argv arrays directly, preserving each argument; stop and report if a required script is absent.

Delegate only for independence or parallel work, with fresh minimal context where supported and every applicable decision. Give each worker this complete brief:

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

Trace a failure and attempt at most two evidence-led fixes, then replan or wait with cause, responsible actor and retry condition. Retain the lane; technical difficulty alone is not an owner decision. Request technical adjudication only for an unresolved conflict or changed evidence. Only an owner-reserved decision waits on the owner. Invoke the owning skills for safe cleanup. At a bounded health stop, retain unfinished required migrations as prerequisites.

Before ending, file at most two improvements that would have made this run cheaper or smoother (rereads, repeated suites, extra rounds, retries, waits), each with evidence; skip when none qualifies. Search open issues where the target lives: this repository for project rules, the loaded skills' repository for skills. On a match, comment this run's evidence. Otherwise invoke `spec` to file a routine fix as a `type:chore` with criteria, scope packet and `lane:proposed`; comment an owner-reserved one on the open `lane:owner` issue titled `Owner improvements`, creating it if absent. Never edit skills or rules in this run.

**Exit gate:** delivery or recorded replan/wait, plus filed improvements; lane retained unless authority changed.

## Output

At most 8 lines: **Summary:** delivery, commands/exits, evidence and waits. **Decision:** next action/actor or reserved choices and recommendation. Update the configured queue; notify only through its authorized channel.
