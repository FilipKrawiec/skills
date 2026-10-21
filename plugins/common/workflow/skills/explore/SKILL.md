---
name: explore
description: Use when a scheduled task or the owner asks for an exploratory usability pass, meaning someone drives the running app as one of its users on a simulator or in a browser and files the friction they meet as issues.
allowed-tools: Read Bash
---

# Explore

File reproducible user friction. Never edit, commit or push code.

Settings, from `.github/lanes.json`: `repo`, `project`, and `explore`:

- `personas`: Markdown; each `## <persona>` says who they are and how they sign in, with `### <journey>` goals.
- `targets`: by name, a simulator `{"launch": "<command>", "device": "<name>"}` (its id goes in variable `deviceEnv`) or a browser `{"launch": "<command>", "url": "<origin>", "viewport": "<w>x<h>"}`, or `urlFromLog`, a regex whose first group is the origin in the launch log, for a port picked at launch.
- `capturesBranch` (default `explore-captures`), `maxIssues` (default 3), `worktree` (default `.worktrees/explore`).

## 1. Prepare

- Never touch the main checkout. Fetch configured `base` (default `main`); create an owned worktree with `git worktree add --detach <worktree> origin/<base>`. Reuse only your clean worktree; otherwise choose another path or wait. Never force-clean or force-checkout another worktree.
- Pick a journey of the caller's persona, if named, by `log.jsonl` on `capturesBranch` (absent at first), first match wins:
  1. The caller's named journey.
  2. A journey never run.
  3. The journey run longest ago.

**Exit gate:** owned worktree at configured origin/<base>; persona, journey, targets chosen.

## 2. Launch

One target at a time, never a physical device. Run `launch` from the worktree in the background, logging to a file; note its pid. First match wins:

1. `device`: first boot a matching available simulator; pass `deviceEnv=<its id>`.
2. `url` or `urlFromLog`, and `viewport`: once the origin answers, open it in a new browser tab at `viewport`, emulating touch if possible.
3. Otherwise: skip the target, saying why.

Poll every 30 s, up to 20 min: the log, then screenshots. A failed build ends the run; its log tail is the only finding.

**Exit gate:** app on screen, or build failure recorded.

## 3. Play

- Be the persona: read only the screen, never code or guide; pursue the journey's goal. Screenshot each step; at most 60 actions per target.
- Injected input lags: wait 2 s before each screenshot; on a simulator hold taps 0.15 s. Record "did nothing" only if a later screenshot agrees; retype text sent before the caret showed. Drop friction you can't reproduce.
- In a browser, follow the repository's preview rules; list touch-only gestures the journey needs (swipe, long-press, pinch) as `notJudged`, never as findings.
- Push past friction. Record each with step, expected, observed and screenshot, graded first match wins:
  1. **Blocker:** the goal is unreachable, or data is lost or wrong.
  2. **Confusion:** you hesitated, guessed, a control did nothing, or an icon had no label.
  3. **Mismatch:** it differs across screens or targets, or the layout misfits (clipped, overlapping, tiny targets).
  4. **Polish:** it works but costs a needless step.

**Exit gate:** journey done or abandoned on each target; findings have screenshots.

## 4. Clean up

Per target, even after a failure: SIGINT the launch process, wait up to 30 s (it may save state), then TERM only processes started by this assignment. Close your tabs; shut down your simulator, never another.

**Exit gate:** none of your launch processes, tabs or simulators remain.

## 5. File

- Merge findings seen on several targets; keep the top `maxIssues` by grade.
- Search issues by screen and symptom (`gh issue list --state all --search "<words>"`), first match wins:
  1. Open match, or the milestone says `Intake: frozen` (then the nearest open issue or epic): comment new evidence.
  2. Closed within 30 days: a new `type:bug` regression issue linking it.
  3. No match: a new issue.
- Captures: commit screenshots to orphan `capturesBranch` at `runs/<date>-<persona>/<n>-<target>.png` (`gh api -X PUT repos/<repo>/contents/<path>`); embed `https://github.com/<repo>/blob/<branch>/<path>?raw=true`. If a workflow's `push` trigger matches it, describe screens instead.
- A new issue: title `<type>(<area>): <outcome for the user>`; `type:bug` when it breaks a product promise or loses data, else `type:story`; `lane:proposed` for the owner. Only now read code: trace the screen's text to the code drawing it for the scope packet.

````markdown
### Executive summary
<Persona> can't <goal>: <what blocks them> on <target>.

**Scope:** <screen>; <what changes>.

### Acceptance criteria

- [ ] <Observable outcome on every target>.

### Estimate
S.

```scope
{"paths": ["<code that draws the screen>"], "dependencies": []}
```

**Steps:** <target>, <persona>: <step> → <step>. Expected …; observed …

![step <n>](https://github.com/<repo>/blob/<capturesBranch>/runs/<date>-<persona>/<n>-<target>.png?raw=true)

<!-- explore-finding persona=<persona> journey=<journey> -->
````

- With a `project`, `gh project item-add` each new issue.

**Exit gate:** each finding filed, commented or dropped with a reason.

## 6. Report

Append `{"date", "persona", "journey", "targets", "issues", "notJudged", "outcome"}` as one line to `log.jsonl` on `capturesBranch` (`notJudged: []` without browser targets).

At most 8 lines:

```markdown
Waiting on @owner: #<n> needs your lane.
**Summary:** <persona>, <journey>, <targets>: #<n> Blocker (opened), #<m> Confusion (commented). Not judged: <notJudged, if any>.
**Decision:** #<n> awaits your lane; I recommend `lane:afk`.
```

Unattended, flag blockers or reserved owner waits; otherwise archive.

**Exit gate:** log line committed, report sent.
