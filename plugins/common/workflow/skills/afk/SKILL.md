---
name: afk
description: One unattended run of the delivery cycle for a repository with .github/lanes.json; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*)
---

# AFK

One run delivers **at most one** `lane:afk` issue; park instead of asking.

- Never touch the starting checkout; work only in worktrees.
- Run only commands named here, in callees and [board.md](../../references/board.md); improvised ones stall on permission prompts.
- `LANES` = `python3 <this skill's directory>/scripts/lanes.py`; Claim, Park, Tidy are board.md's Issue steps.
- Reasoning: high `spec`; medium `plan`, `review`, `improve`; low `tdd`; lowest otherwise; raise after two failures.
- Read [setup.md](references/setup.md) without `.github/lanes.json` or when scheduling runs.
- Read [github-safety.md](references/github-safety.md) when setting up or checking the repository's GitHub settings.

## 1. Ship

Invoke `ship`.

**Exit gate:** `ship`'s exit gate.

## 2. Tend

For each open `branchPrefix` PR whose issue has `lane:afk`, in its worktree: run board.md's Merge gate; fix unanswered blocking reviews, then `LANES merge <pr>`. Verify fully before every push. Park on a product decision or two failed fixes.

**Exit gate:** each own PR green and conflict-free, or parked.

## 3. Pick

Base red → phase 5. Else `LANES next`: `next: #N` → phase 4; `in flight: … (stale …)` → park it, then phase 5; `next: none` → phase 5.

**Exit gate:** an issue number, or housekeeping.

## 4. Deliver

1. Claim; read the issue, its linked decisions, project rules.
2. Invoke `plan`.
3. `tdd` per step, commit per `vcs`, update tied docs; pass `LANES scope <N>` and full verification.
4. `review` as two fresh-context workers (axes A, B) given only issue and diff; two rounds max. Then Open PR.

Park (question, options, recommendation) when the issue is ambiguous or contradicts rules, needs an out-of-scope or protected path, an undecided product or model choice, credentials, settings or a device, or stays red or blocked after two attempts. Verify first: trace the failure to its raising call; list fixes keeping all criteria.

**Exit gate:** PR URL with the `LANES merge` line, or a parked issue.

## 5. Housekeeping

Only when nothing was delivered: `LANES merge` each Dependabot PR (comment the failing excerpt when red); `spec` the issues `LANES next` lists untriaged. Never start follow-ups; list them.

**Exit gate:** each printed result.

## 6. Close

Invoke `improve` for each issue in 07 Improve and this run's friction; Tidy.

**Exit gate:** `improve`'s exit gates; worktrees removed.

## Output

board.md's Reporting to the owner form. Summary, changed items only: base health, PRs tended, delivered PR with merge line (or "queue empty"), lesson PRs, housekeeping. Decision: parks, follow-ups, proposed lessons.
