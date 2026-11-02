---
name: afk
description: Use when asked to run an unattended AFK issue or explicitly requested to use AFK in a repository with .agents/config.json.
allowed-tools: Skill Read Edit Write Bash(git:*,gh:*,node:*,just:*,lsof:*)
---

# AFK

Deliver the requested authorized slice, or one unattended slice per run. Read `.agents/config.json` from fetched `origin/HEAD` for identities and step scripts. Never change the main checkout. Invoked by the owner, work only on their requested items.

Read [setup.md](references/setup.md) only for scheduling, and [github-safety.md](references/github-safety.md) only for GitHub protection. Use `safety check` for inspection; run `safety apply` only on explicit owner instruction.

## 1. Establish work

Check base head and required checks once. Invoke `ship` for a failed base or merged work needing follow-up; never rescan a healthy head. Until base is green, deliver no new work; record the wait and next actor. Read the issue's authority, criteria, scope, dependencies, decisions and milestone; reuse decisions unless evidence or intent changed.

Delegate routine work within scope; product direction, paid services, budgets, authority and production approval stay with the owner. Board status grants no authority. Preserve existing work; never hold an issue twice.

**Exit gate:** authorized slice and green base, or a recorded wait and next actor.

## 2. Select or resume

For AFK, the CLI's `Hold:`/`Work:` output is the assignment; take no second item. Owner requests use `afk start --me ID --issue NUMBER`.

Write issues through the workflow CLI: `issue comment` or `issue edit --number N --body-file PATH` (a single-link worktree file) and `issue close --number N`; invoke `spec` for transitions, and to slice or close the epic a `Work: epic #N` line names. A `refine` unit changes no files.

**Exit gate:** resumed PR, exclusive assignment, or queue empty/wait reason.

## 3. Deliver

Invoke the skills for implementation, review and VCS. After each push, a fresh subagent loading `agent-review` posts the binding verdict, briefed without your reasoning. Fix its findings here; a new one reviews each delta. Load `agent-review` itself only for a held review unit. Stay on the issue until its PR merges, then invoke `ship`. Where supported, run review, and fixes after a `round=2`-or-later `verdict=fixes`, on its strongest model at high effort, since cheaper fixes reintroduced blockers; run other agents on its standard model. Run `steps.test` once per head, after its last fix; targeted tests between fixes. Every changed or untracked path belongs in the scope packet. Before the first review, compare the diff's changed files with `### Estimate` (S about 5, M about 20); past twice that, or on `verdict=split`, invoke `spec` to split the issue instead of reviewing. File the Reviewer's follow-ups via `spec`. Verify criteria, scope, decisions and findings against authoritative records, not generated context.

Follow **Process → Assemble → Test**. Process the issue and plan with the invoked skills (`steps.process` is `null`). Assemble the authorized change; run `steps.assemble` with `{platform}` when previewing the app (`null`: no assembly command). For an explicitly read-only workflow check, test its criteria with CLI evidence, skipping assembly and code tests unless the issue asks. Run argv arrays directly, substituting only placeholders; stop and report if a required script is absent.

Delegate only for independence or parallelism, with fresh minimal context and every applicable decision. Give each worker this complete brief:

```text
Intent: <issue, approved outcome and assigned phase>.
Criteria and scope: <acceptance, paths, exclusions, dependencies, claim>.
Checkout: <worktree, base/head SHAs, last reviewed SHA>.
Decisions and evidence: <applicable choices, prior findings, checks and captures>.
Load <skill>; do only the assigned phase. Preserve edits; do not dispatch,
approve your own work, promote or expose credentials. Return paths, head,
commands/exits, findings, exit gate and decisions in at most 8 lines.
```

**Exit gate:** merged PR with `ship` evidence, or a bounded failure record.

## 4. Recover and close

Trace a failure and attempt at most two evidence-led fixes, then replan or wait with cause, responsible actor and retry condition. Retain the lane; technical difficulty alone is not an owner decision. Request technical adjudication only for an unresolved conflict or changed evidence; only owner-reserved decisions wait on the owner. Invoke the owning skills for safe cleanup. At a bounded health stop, retain unfinished required migrations as prerequisites.

Before ending a held run, file at most two evidenced improvements that would have made it cheaper (rereads, repeated suites, retries, waits), or none. Write here for project rules; for skills add `--repo` with the loaded skills' origin, and treat a CLI refusal as owner-reserved, with its link. Comment new evidence on an open match; otherwise invoke `spec` and `issue create` a routine fix as `type:bug` or `type:chore` with criteria, packet and lane. Comment owner-reserved ones on the issue `issue create --unique --title "Owner improvements" --labels type:task,lane:owner --body-file PATH` returns. Never edit skills or rules here.

**Exit gate:** delivery or recorded replan/wait, plus filed improvements; lane retained unless authority changed.

## Output

At most 8 lines: **Summary:** delivery, commands/exits, evidence and waits. **Decision:** next action/actor or reserved choices and recommendation. Update the configured queue; notify only through its authorized channel.
