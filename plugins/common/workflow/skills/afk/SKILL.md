---
name: afk
description: Use when asked to run an unattended AFK issue or explicitly requested to use AFK in a repository with .agents/config.json.
allowed-tools: Skill Read Edit Write Bash(git:*,gh:*,node:*,just:*,lsof:*)
---

# AFK

Deliver the requested authorized slice, or one unattended slice per run. Read `.agents/config.json` from fetched `origin/HEAD` for identities and step scripts. Never change the main checkout. Invoked by the owner, work only on their requested items.

Read [setup.md](references/setup.md) only for scheduling and [github-safety.md](references/github-safety.md) only for GitHub protection; `safety check` inspects, `safety apply` needs explicit owner instruction.

## 1. Establish work

Check base head and required checks once; invoke `ship` for a failed base or merged work needing follow-up. Until base is green, deliver no new work; record the wait and next actor. Check the issue's authority, criteria, scope, dependencies, decisions and findings against authoritative records; reuse decisions unless evidence or intent changed.

Delegate routine work; product direction, paid services, budgets, authority and production approval stay with the owner. Board status grants no authority. Preserve existing work; never hold an issue twice.

**Exit gate:** authorized slice and green base, or a recorded wait and next actor.

## 2. Select or resume

For AFK, the CLI's `Hold:`/`Work:` output is the assignment; take no second item. Owner requests use `afk start --me ID --issue NUMBER`.

Write implementer records through the workflow CLI: `issue comment` or `issue edit --number N --body-file PATH` (a single-link worktree file) and `issue close --number N`; invoke `spec` for transitions, and to slice or close the epic a `Work: epic #N` line names. A `refine` unit changes no files.

**Exit gate:** resumed PR, exclusive assignment, or queue empty/wait reason.

## 3. Deliver

You orchestrate only: after the plan's approval never edit project files yourself.

1. **Plan:** invoke `plan`; a 100% reproducibility score approves it.
2. **Execute:** dispatch one fresh Craftsman subagent loading `tdd` with the plan, briefed with [worker-brief.md](references/worker-brief.md). It returns `done`, `stuck` or `replan`. Compare changed files with `### Estimate` (S ~5, M ~20); past twice that, or needing several PRs, invoke `spec` to split it and build its first sub-issue.
3. **Open:** verify the scope packet covers every changed path, run `steps.test` once, then invoke `vcs` to commit, push, open the draft PR with the plan's context and decisions, and have its risk label set.
4. **Review:** a fresh subagent loading `agent-review` reviews the draft, given the Reviewer brief below without your reasoning. On `verdict=fixes`, invoke `pr-fix`, then review again; on `verdict=split`, invoke `spec` to split it. `verdict=cap` or `shape` ends delivery; report it.
5. **Ship:** on `verdict=ready`, invoke `ship`. The run ends at the ready PR; team review and merge follow without it.

A held PR unit does what its `Work:` line says, first match wins: `passed author review` invokes `ship`; `held for its size` invokes `spec` to split its issue, unless an owner decision on the PR keeps it whole; `awaits its review` loads `agent-review` itself and commits nothing; any other open PR invokes `pr-fix`; `merged` invokes `ship` then `improve` on that PR alone. Run `steps.assemble` with `{platform}` only when previewing the app (`null`: none). Run argv arrays directly; stop and report a missing required script.

The Reviewer's brief:

```text
Review PR #<N> (issue #<issue>): base <SHA>, head <SHA>, last reviewed <SHA|none>.
Plan: <link>. Load agent-review; post with GH_TOKEN=$(gh auth token
--user <config reviewer>) on each gh call. Never print the token.
Return verdict, round and Important findings in at most 8 lines.
```

**Exit gate:** ready PR handed to team review, a capped draft, or a bounded failure record.

## 4. Recover and close

Trace a failure and attempt at most two evidence-led fixes, then replan or wait with cause, responsible actor and retry condition. Retain the lane; technical difficulty alone is not an owner decision. Only unrecorded owner-reserved decisions wait on the owner; fetch an official asset a recorded one names from its publisher; request technical adjudication only for an unresolved conflict. Invoke the owning skills for safe cleanup. At a bounded health stop, retain unfinished required migrations as prerequisites.

Never edit skills or rules here: lessons go through `improve` after merge, which files plugin lessons as follow-up issues, never agent memory.

**Exit gate:** delivery or recorded replan/wait; lane retained unless authority changed.

## Output

At most 8 lines: **Summary:** delivery, commands/exits, evidence and waits. **Decision:** next action/actor or reserved choices and recommendation. Update the configured queue; notify only through its authorized channel.
