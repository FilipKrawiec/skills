---
name: explore
description: Use when a scheduled task or the owner asks for an exploratory usability pass by driving the running app as a user and filing friction.
allowed-tools: Read Bash
---

# Explore

Explore as the configured persona; file reproducible friction. Never change product code, commit it or push it. Read `.github/agent-workflow.json` for `repo`, `project` and `explore`: personas and their journeys; simulator or browser targets and launch commands; `capturesBranch` (default `explore-captures`), `maxIssues` (default 3), `worktree`, `epic` and `idleHours`. A target may provide `urlFromLog` instead of its browser URL. Read [idle.md](references/idle.md) only for an idle run.

## 1. Prepare and launch

Fetch the configured base (default `main`) and use an owned clean isolated worktree at its head; never alter the main checkout or another session's worktree. For the requested persona, choose the named journey, otherwise a never-run journey, otherwise the least recently run using `log.jsonl` on `capturesBranch`.

Launch one target at a time from that worktree. For a simulator, boot a matching available device and pass its ID in the configured `deviceEnv`; never use a physical device. For a browser, wait for the configured origin, open a new tab at its viewport and emulate touch when possible. Record unsupported targets and build failures, including the relevant log tail. Bound startup to 20 minutes.

**Exit gate:** persona, journey and targets running or explicit launch failures.

## 2. Play and clean up

Pursue the goal from the visible screen as the persona, without reading code or guides. Follow repository preview rules; use at most 60 actions per target. Capture each step and inspect the launch log or console. Wait for the interface to settle and reproduce a suspected no-op before filing; drop unreproducible friction. Browser touch-only gestures are `notJudged`.

Grade each reproducible finding once: **Blocker** for an unreachable goal, data loss/wrong data, crash or freeze; **Confusion** for hesitation, guessing, no-op, error or unlabeled icon; **Mismatch** for inconsistent, clipped, overlapping or undersized UI; **Polish** for needless steps. Record target, steps, expected, observed and screenshots. Continue the journey past friction where possible.

After each target, including failures, stop only your launch processes, close your tabs and shut down only simulators you booted.

**Exit gate:** each journey completed or abandoned, evidence collected, owned processes and devices stopped.

## 3. File and report

Merge findings across targets and keep at most `maxIssues`. Search existing issues by screen and symptom. Comment new evidence once on an open match; file a regression linked to a match closed within 30 days; otherwise file a new issue. Use `type:bug` for a broken promise or lost data, otherwise `type:story`; set `lane:proposed` for the configured Reviewer when `afk.reviewerApprovesAfk` is enabled, otherwise for the owner. Only now read code to identify scope. Each issue names the persona, user outcome, target, steps, expected/observed result, observable acceptance, estimate and a scope packet. Include `<!-- explore-finding persona=<persona> journey=<journey> -->` in each new issue for readiness triage.

Save real screenshots under `runs/<date>-<persona>/` on the configured captures branch and link them in the issue. If pushing that branch would trigger CI, describe the screens instead; never trigger CI for captures. Add new issues to the configured project and as sub-issues of the open epic for the area, or the configured fallback epic. Append the date, persona, journey, targets, issues, `notJudged` and outcome to `log.jsonl` on the captures branch only if it will not trigger CI; otherwise report the log write as pending.

**Exit gate:** findings filed, commented or dropped with reasons; run log recorded or explicitly pending.

## Output

At most 8 lines: **Summary:** persona, journey, targets, issue links, findings and `notJudged`. **Decision:** next action/actor or owner wait. Unattended, flag blockers and owner waits; otherwise archive.
