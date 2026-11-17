# Drive transcript check: stagely-pro#1611

**Result: the criterion is not met as worded** (issue #605). Implementers, devops and Reviewer sessions ran no `gh issue edit`, `gh pr edit`, `gh pr merge` or board call. Planner and improver subagents did run raw `gh` mutations, and the owner session ran several by hand outside drive.

### Method
I scanned every Bash call in these transcripts (tool_use records, de-duplicated by id) for `gh issue edit|close|comment|create`, `gh pr edit|merge|ready|create|comment`, `gh project`, `gh api` with `-X`/`-f`/`-F`/`graphql`, `--add-label`, `--remove-label`, `--milestone`, `auto-merge`, and `workflow.mjs issue|pr`.

- Owner session `b50aa3be-3966-474d-8497-d9ac19fff963`.
- 13 subagents under its `subagents/`: planners, implementers, devops and improvers.
- 12 stagely-pro Reviewer and worktree sessions (`review-1629-r1`, `r1b`, `approve-1629`, the #1627/#1630/#1631/#1633/#1637 review rounds, `epic-1611-outcome`).

Slices and PRs in scope: #1627 (#1632), #1630 (#1635), #1631 (#1636), #1633 (#1634), bootstrap #1629, Nits #1637 (#1638). `drive`'s own `gh` calls (label, claim, ready, squash auto-merge, merge) run inside the CLI and are not in transcripts; no transcript shows an agent running them directly.

### Agent-run counts (stagely-pro #1611 scope)
| Call | Implementer | Devops | Reviewer | Planner | Improver |
|---|---|---|---|---|---|
| `gh issue edit` (raw) | 0 | 0 | 0 | 2 (`--milestone v1` on #1627 #1630 #1631 at 12:19:58; on #1633 at 12:30:40) | 0 |
| `gh pr edit` | 0 | 0 | 0 | 0 | 0 |
| `gh pr merge` | 0 | 0 | 0 | 0 | 0 |
| board (`gh project`, ProjectV2 GraphQL) | 0 | 0 | 0 | 0 | 0 |
| `gh api -X POST .../sub_issues` | 0 | 0 | 0 | 2 (#1630, #1631 into #1611) | 0 |
| `gh api -X POST .../dependencies/blocked_by` | 0 | 0 | 0 | 4 (#1630<-#1627, #1631<-#1627, #1631<-#1630, #1631<-#1633) | 0 |
| raw comment (`gh issue comment` / `gh api` POST) | 0 | 0 | 1 (`epic-1611-outcome`, POST to #1611 comments as the reviewer token) | 0 | 1 (`gh issue comment 1611`, Lessons) |
| `workflow.mjs pr auto-merge` | 0 | 0 | 1 (#1629) | 0 | 0 |
| `workflow.mjs issue create/edit/comment` | 0 | 0 | 0 | create #1630 #1631; edit #1627 #1611 #1633; comment #1627 #1633 | create #1637 |

Reviewer rounds otherwise used only `review-context`, `review-post`, `wait`, `status`, `scratch` and read-only `gh` (`pr view`, `pr diff`, `api` GETs).

Cause of the planner raw calls: `workflow.mjs issue create` takes only `--title --body-file [--labels] [--repo] [--unique] [--check]` and `issue edit` only the body, so milestone, parent link and blocked-by have no CLI route. The planner brief also instructs `gh api` for the sub-issue and blocked-by links, so the planners fell back to `gh`. [#629](https://github.com/FilipKrawiec/skills/issues/629) adds the CLI options.

### Owner session, by hand, outside drive
| When (UTC) | Calls | Cause |
|---|---|---|
| 2026-11-17 08:56-09:00 (PR #1629) | `gh pr create --draft`, `gh pr edit --add-assignee`, `gh pr edit --add-reviewer`, `gh pr edit --add-label risk:R1 --remove-label state:reviewing`, `gh pr comment` (risk note), `workflow.mjs pr ready`, hand-launched `review-session.mjs` (r1, r1b, approve) | Owner-authorized bootstrap: drive reads the Codex roles from main, so it could not deliver its own role change to Claude. Without drive there was no devops risk step, so the owner set the risk label and assignee. The owner reran the Reviewer as r1b once the label was set and the stale claim cleared. A plain `git commit && git push origin HEAD:main` was refused by the commit hook; the PR went through `workflow.mjs push`. The Reviewer then ran `pr auto-merge --pr 1629`. |
| 12:21 (#1623) | `workflow.mjs issue edit --number 1623` (marker `workflow:epic-refinement` -> `workflow:refinement-superseded-by 1631`) and `issue comment` | #1623, a refinement closed 2026-11-16 before the Claude roles and slices existed, made drive treat refinement as already done. The owner superseded it by hand. |
| 12:27-12:37 (#1633) | `issue create` (#1633), raw `gh api -X POST .../1611/sub_issues`, `issue edit --number 1633` five times (the 12:27 and 12:29:18 attempts were denied by auto mode as "Undermining Oversight"; 12:29:38 landed; scope paths widened at 12:33 for `tool/tests/test_config_notice_workflow.py` and at 12:37 for `docs/github-platform.md`) | The owner filed #1633 mid-run after the owner chose "Reviewer owns the config". The sub-issue link has no CLI route. The two scope edits fixed packets that omitted a test file and a doc the Reviewer found stale. |
| 2026-11-16 21:31 (#604, skills repo, day before; outside #1611) | `issue edit --number 604`, `issue comment`, raw `gh api -X DELETE .../482/sub_issue`, raw `gh api -X PATCH ... state=closed` | Consolidated #604 into #603. No CLI close or unlink. |
| 2026-11-17 08:40 (#602, skills repo; outside #1611) | Not the owner: the consolidation planner ran raw `gh issue edit 601`, `gh issue comment 602`, `gh issue edit 602`, `gh issue close 602` | Same missing CLI close/edit path. |

Same-day skills-repo planners also ran raw `gh issue edit` on #622 (title) and #625 (title), `gh issue close` on #618 and #626, and comments; they are outside #1611 and not counted above.

### Follow-ups (CLI gap: filed separately)
- Add `--milestone`, `--parent`, `--blocked-by` to `issue create/edit`, and `issue close` and sub-issue unlink, so planners and the owner need no raw `gh`.
- Let drive set `risk:`/assignee on a bootstrap PR, or make the first config change deliverable by drive, so no `pr edit` by hand is needed.
- The `epic-1611-outcome` Reviewer posts the outcome comment with raw `gh api`; a CLI path would remove it.
