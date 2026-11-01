---
name: explore
description: Use when a scheduled task or the owner asks for an exploratory usability pass by driving the running app as a user and filing friction.
allowed-tools: Read Bash
---

# Explore

Explore as the configured persona; file reproducible friction. Never change product code, commit it or push it. Run `workflow.mjs cache show` for the resolved project, step scripts, persona path, capture branch, issue limit, idle interval and base. Place the dedicated worktree at `.worktrees/explore` beside the Git common directory, so all linked worktrees share it without agent-specific paths. The project defines scripts in `.agents/config.json`; the workflow defines the phases.

## 1. Process

Fetch the resolved base and use the clean isolated exploration worktree at its head; never alter the main checkout or another session's worktree. For the requested persona, choose the named journey, otherwise a never-run journey, otherwise the least recently run using `log.jsonl` on the resolved capture branch.

Read the repository's agent instructions and developer README to learn its supported platforms, preview process and test workflow. Choose a platform the host can run. If those instructions do not describe a usable run, stop and report the missing project instruction; never add platform configuration to the workflow.

**Exit gate:** persona, journey and host-supported platform chosen, or the missing instruction reported.

## 2. Assemble

Read `steps.assemble` from `cache show`. If it is missing or `null`, stop and report that no app assemble script is configured. Otherwise substitute `{platform}` in its argv and run it from the isolated worktree, logging output. For a browser, open the URL printed by the app's run command at a usable viewport. For a simulator, boot an available matching device; never use a physical device. Start one platform at a time and bound startup to 20 minutes. Record unsupported platforms and build failures with the relevant log tail.

**Exit gate:** app running on screen or the documented assemble command failed.

## 3. Test and clean up

Pursue the goal from the visible screen as the persona, without reading code or user guides. This is the Test phase for an exploratory run; do not invoke the code-test script because this skill never changes product code. Use at most 60 actions per platform. Capture each step and inspect the run log or console. Wait for the interface to settle and reproduce a suspected no-op before filing; drop unreproducible friction. Browser touch-only gestures are `notJudged`.

Grade each reproducible finding once: **Blocker** for an unreachable goal, data loss/wrong data, crash or freeze; **Confusion** for hesitation, guessing, no-op, error or unlabeled icon; **Mismatch** for inconsistent, clipped, overlapping or undersized UI; **Polish** for needless steps. Record platform, steps, expected, observed and screenshots. Continue the journey past friction where possible.

After each platform, including failures, stop only your launch processes, close your tabs and shut down only simulators you booted.

**Exit gate:** each journey completed or abandoned, evidence collected, owned processes and devices stopped.

## 4. File and report

Merge findings across platforms and keep at most `maxIssues`. Search existing issues by screen and symptom. Comment new evidence once on an open match; file a regression linked to a match closed within 30 days; otherwise file a new issue. Use `type:bug` for a broken promise or lost data, otherwise `type:story`; set `lane:proposed` for automated AFK eligibility review. Only now read code to identify scope. Each issue names the persona, user outcome, platform, steps, expected/observed result, observable acceptance, estimate and a scope packet. Include `<!-- explore-finding persona=<persona> journey=<journey> -->` in each new issue for readiness triage.

Save real screenshots under `runs/<date>-<persona>/` on the resolved capture branch and link them in the issue. If pushing that branch would trigger CI, describe the screens instead; never trigger CI for captures. Add issues to the discovered GitHub Project. Link each under an open epic for its area when one exists; otherwise leave it standalone. Append the date, persona, journey, platforms, issues, `notJudged` and outcome to `log.jsonl` on the capture branch only if it will not trigger CI; otherwise report the log write as pending.

**Exit gate:** findings filed, commented or dropped with reasons; run log recorded or explicitly pending.

## Output

At most 8 lines: **Summary:** persona, journey, platforms, issue links, findings and `notJudged`. **Decision:** next action/actor or owner wait. Unattended, flag blockers and owner waits; otherwise archive.
