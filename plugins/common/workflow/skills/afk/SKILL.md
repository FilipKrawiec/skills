---
name: afk
description: Use when asked to run an unattended AFK issue or explicitly requested to use AFK in a repository with .agents/config.json.
allowed-tools: Skill Read Edit Write Bash(git:*,gh:*,node:*,just:*,lsof:*)
---

# AFK

Deliver the requested authorized slice, or one unattended slice per run. Read `.agents/config.json` from fetched `origin/HEAD` for identities and step scripts. Never change the main checkout. Invoked by the owner, work only on their requested items.

Read [setup.md](references/setup.md) only for scheduling, [github-safety.md](references/github-safety.md) only for GitHub protection. Use `safety check` for inspection; run `safety apply` only on explicit owner instruction.

## 1. Establish work

Check base head and required checks once; invoke `ship` for a failed base or merged work needing follow-up. Until base is green, deliver no new work; record the wait and next actor. Read the issue's authority, criteria, scope, dependencies and decisions; reuse decisions unless evidence or intent changed.

Delegate routine work; product direction, paid services, budgets, authority and production approval stay with the owner. Board status grants no authority. Preserve existing work; never hold an issue twice.

**Exit gate:** authorized slice and green base, or a recorded wait and next actor.

## 2. Select or resume

For AFK, the CLI's `Hold:`/`Work:` output is the assignment; take no second item. Owner requests use `afk start --me ID --issue NUMBER`.

Write issues through the workflow CLI: `issue comment` or `issue edit --number N --body-file PATH` (a single-link worktree file) and `issue close --number N`; invoke `spec` for transitions, and to slice or close the epic a `Work: epic #N` line names. A `refine` unit changes no files.

**Exit gate:** resumed PR, exclusive assignment, or queue empty/wait reason.

## 3. Deliver

Invoke the skills for implementation, review and VCS. After each push, a fresh subagent loading `agent-review` posts the binding verdict, given the Reviewer brief below without your reasoning. Fix its findings here; a new one reviews each delta. Load `agent-review` itself only for a held review unit. Stay on the issue until its PR merges, then invoke `ship`. Run review, and fixes after a `round=2`-or-later `verdict=fixes`, on the host's strongest model at high effort (cheaper fixes reintroduced blockers); others on its standard model. Run `steps.test` once per head, after its last fix; targeted tests between fixes. Every changed or untracked path belongs in the scope packet. Before the first review, compare the diff's changed files with `### Estimate` (S about 5, M about 20); past twice that, or on `verdict=split`, invoke `spec` to split the issue instead of reviewing. File the Reviewer's follow-ups via `spec`. Check criteria, scope, decisions and findings against authoritative records.

Process the issue and plan with the invoked skills; run `steps.assemble` with `{platform}` only when previewing the app (`null`: none). Test an explicitly read-only workflow check with CLI evidence alone unless the issue asks. Run argv arrays directly, substituting only placeholders; stop and report a missing required script.

Delegate only for independence or parallelism. Brief every other worker in full:

```text
Intent: <issue, approved outcome and assigned phase>.
Criteria and scope: <acceptance, paths, exclusions, dependencies, claim>.
Checkout: <worktree, base/head SHAs, last reviewed SHA>.
Decisions and evidence: <applicable choices, prior findings, checks and captures>.
Load <skill>; do only the assigned phase. Preserve edits; do not dispatch,
approve your own work, promote or expose credentials. Return paths, head,
commands/exits, findings, exit gate and decisions in at most 8 lines.
```

The Reviewer's brief:

```text
Review PR #<N> (issue #<issue>): base <SHA>, head <SHA>, last reviewed <SHA|none>, round <R>.
Axis A/B findings: <file:line list>; earlier findings: <list>.
Load agent-review; post its exact-head decision with GH_TOKEN=$(gh auth token
--user <config reviewer>) on each gh call. Never print the token.
Return verdict, blockers and follow-ups in at most 8 lines.
```

**Exit gate:** merged PR with `ship` evidence, or a bounded failure record.

## 4. Recover and close

Trace a failure and attempt at most two evidence-led fixes, then replan or wait with cause, responsible actor and retry condition. Retain the lane; technical difficulty alone is not an owner decision. Only owner-reserved decisions wait on the owner; request technical adjudication only for an unresolved conflict. Invoke the owning skills for safe cleanup. At a bounded health stop, retain unfinished required migrations as prerequisites.

Before ending a held run, file at most two evidenced improvements that would have made it cheaper. Write here for project rules; for skills add `--repo` with the loaded skills' origin, and treat a CLI refusal as owner-reserved, with its link. Comment evidence on an open match, such as an `issue create --check` overlap; otherwise file via `spec` a routine `type:bug` or `type:chore` with criteria, packet and lane. Comment owner-reserved ones on the issue `issue create --unique --title "Owner improvements" --labels type:task,lane:owner --body-file PATH` returns. Never edit skills or rules here.

**Exit gate:** delivery or recorded replan/wait, plus filed improvements; lane retained unless authority changed.

## Output

At most 8 lines: **Summary:** delivery, commands/exits, evidence and waits. **Decision:** next action/actor or reserved choices and recommendation. Update the configured queue; notify only through its authorized channel.
