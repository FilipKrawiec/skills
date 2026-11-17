# Targets measured: stagely-pro epic #1611

Verdict (issue #606, targets from #409): **partly met.** Cost per PR and review rounds hold. Agents per PR and refusals per agent miss. Causes below; nothing is hidden or rounded in our favour.

| Target | Result | Verdict |
|---|---|---|
| <= $20 per merged PR | $1.4 to $3.4 per drive-run PR; whole milestone <= $37.8 over 6 PRs (<= $6.3 per PR) | met |
| <= 3 agents per merged PR | 3 on 4 PRs; 5 on #1634 (8 recorded sessions), 4 on #1635 (5 recorded sessions) | **missed** on 2 of 6 |
| <= 2 review rounds per merged PR | max 2 (#1634, #1635); the rest 1 | met |
| < 0.1 refused commands per agent | 0.24 (6 of 25 agent sessions); 0.46 with the owner session | **missed** |

Scope: #1611 closed 2026-11-17T13:43:56Z. Merged PRs #1629 (bootstrap, outside drive), #1632, #1634, #1635, #1636, #1638. Per-PR `status <pr>` usage rows plus the transcripts under `~/.claude/projects/-Users-filip-Developer-github-com/b50aa3be-3966-474d-8497-d9ac19fff963/` (owner session, `subagents/`) and the 12 stagely-pro Reviewer sessions.

## Cost

Reviewer cost is as drive reported it (`workflow:usage`, Opus, medium). Implementer, devops, planner and improver usage is unreported, so I derived it from the subagent transcripts (deduplicated by message id). The workflow CLI's own reviewer costs fit Opus rates of $4 in, $20 out, $0.20 cache read and $8 cache write per million tokens (7 rows, exact to the cent), so I applied them to every agent. Implementers ran on Sonnet, whose rate is not in the data: **those figures are an upper bound.**

| PR (issue) | Implementer | Devops | Planner | Reviewer | Total |
|---|---|---|---|---|---|
| #1632 (#1627) | 0.52 | 0.43 | | 0.44 | 1.39 |
| #1634 (#1633) | 0.90 | 0.51 | 0.84 | 1.13 | 3.38 |
| #1635 (#1630) | 0.95 | 0.67 | | 0.83 | 2.45 |
| #1636 (#1631) | 0.86 | 0.63 | | 0.47 | 1.96 |
| #1638 (#1637) | 0.56 | 0.38 | | 0.51 | 1.45 |
| #1629 bootstrap | owner by hand | | | 1.19 | 1.19 (+ owner) |

Epic overhead, not per PR: slicing planner $1.48, closure improver $0.93, three epic-closure Reviewer sessions $2.24. Agents total $16.47 (upper bound).

Owner/drive session: `claude-opus-5-5`, effort `medium`, permission mode `auto` (observed in the transcript). Its tokens over the #1611 windows (08:30-09:10Z bootstrap, 12:09-13:44Z drive run) cost <= $21.3 at the Opus rates ($5.5 + $15.8). The run window includes interleaved skills-repo work (#610, #622, #625), so this is an upper bound. Whole session since 2026-11-16 21:17Z: $29.0, 950 in, 138,767 out, 101.4M cache read, 741k cache write.

Unknown: usage of resumed rounds. Drive recorded 3 implementer and 2 devops sessions on #1634 and 2 implementer on #1635, but only one transcript each exists under `subagents/`; the resume messages ("coordinator sent a message while you were working") end the transcript. Missing rounds would add roughly $0.5 to $1 each, which leaves every PR far below $20. Drive also attached the epic Reviewer and improver rows to #1629, so its `status` overstates that PR.

## Agents and rounds

| PR | Recorded sessions (`status`) | Distinct transcripts | Round |
|---|---|---|---|
| #1629 | 3 Reviewer (r1, r1b, approve), owner as implementer | 3 | 1 (r1b was a rerun after the label and stale claim) |
| #1632 | devops 1, Reviewer 1 (implementer unrecorded) | 3 | 1 |
| #1634 | planner 1, implementer 3, devops 2, Reviewer 2 | 5 | 2 |
| #1635 | implementer 2, devops 1, Reviewer 2 | 4 | 2 |
| #1636 | implementer 1, devops 1, Reviewer 1 | 3 | 1 |
| #1638 | implementer 1, devops 1, Reviewer 1 | 3 | 1 |

Cause of the misses. #1634: the owner filed #1633 mid-run (a planner agent), then widened its scope packet twice for a test file and a doc the Reviewer found stale, which resumed the implementer and devops. #1635: round 2 added a Reviewer plus an implementer resume. The target is also tight by construction: implementer, devops and Reviewer make 3, so any second blocking round puts a PR at 4 with distinct agents. Either the target counts resumes and extra rounds differently, or it needs restating.

## Refusals

Denominator: 25 agent sessions (13 subagent transcripts and 12 Reviewer and worktree sessions; the owner session is counted separately, not in the 25). Strict refusals (auto-mode denial, hook block, tool block, CLI refusal):

| Agent | Refused | Command and cause |
|---|---|---|
| Implementer #1627, #1633, #1637 | 3 | `workflow.mjs check --worktree ...` run without `cd`: "Check must run from the intended worktree". The Bash cwd resets every call and the brief's `check` line has no `cd`. Each retried with `cd && ...` once. |
| Planner #1633 | 1 | `issue edit` without `--body-file`: usage error |
| Improver #1611 | 1 | `sleep 60; cat ...` blocked by the sleep guard |
| Reviewer (epic closure) | 1 | `gh api -X DELETE .../issues/comments/6949454687` denied by auto mode as "Destructive or Unwanted Actions" |

6 of 25 = 0.24. Failed but not refused: 10 (planner #1611 two read errors, two macOS `sed` errors in implementers, one devops `gh pr diff` arg error, one zsh glob error and four exit-1 reads or diffs in Reviewers).

Owner session, same windows: 172 Bash calls, 10 non-zero; 5 auto-mode denials (08:45:37 "Unsanctioned Communication"; 08:55:40, 12:27:30, 12:29:21 and 13:40:01 "Undermining Oversight", the last `drive 1639`), 1 hook block (plain `git commit`, 08:45:25), 4 other failures (two "GitHub command failed", one `gh auth status | head`, one exit 1 after a successful `push`). With the owner: 12 of 26 = 0.46.

The #605 record counts the 12:27 and 12:29 denials and the raw-`gh` fallbacks; this record adds the agents' own refusals.

## Follow-ups to consider (not filed here)

- Make the brief's `check` line self-sufficient: either prefix `cd <worktree> &&` or have `check --worktree` work from any cwd. This removes 3 of 6 agent refusals.
- Have drive record implementer, devops, planner and improver usage (and resume sessions) so `status` stops saying "unreported" and the sessions count matches the transcripts.
- Decide whether "3 agents" counts resumes and the second review round; restate the target or the process.
