---
name: explore
description: Use when a scheduled task or the owner asks for an exploratory usability pass, meaning someone drives the running app as one of its users on a simulator or in a browser and files the friction they meet as issues.
allowed-tools: Read Bash
---

# Explore

File reproducible user friction. Never edit, commit or push code.

Settings, from `.github/lanes.json`: `repo`, `project`, and `explore`:

- `personas`: Markdown; each `## <persona>` says who they are and how they sign in, with `### <journey>` goals.
- `targets`: by name, a simulator `{"launch": "<command>", "device": "<name>"}` (its id goes in variable `deviceEnv`) or a browser `{"launch": "<command>", "url": "<origin>", "viewport": "<w>x<h>"}`; `urlFromLog`, a regex whose first group is the origin in the launch log, replaces `url`.
- `capturesBranch` (default `explore-captures`), `maxIssues` (default 3), `worktree` (default `.worktrees/explore`), `epic` (a fallback parent).

Read [idle.md](references/idle.md) when an idle AFK run starts this one.

## 1. Prepare

- Never touch the main checkout. Fetch configured `base` (default `main`); create an owned worktree with `git worktree add --detach <worktree> origin/<base>`. Reuse only your own clean worktree, else pick another path; never force-clean or force-checkout another.
- Pick a journey of the caller's persona, if named, by `log.jsonl` on `capturesBranch`, first match wins:
  1. The caller's named journey.
  2. A journey never run.
  3. The journey run longest ago.

**Exit gate:** owned worktree at configured origin/<base>; persona, journey, targets chosen.

## 2. Launch

One target at a time, never a physical device. Run `launch` from the worktree in the background, logged to a file. First match wins:

1. `device`: first boot a matching available simulator; pass `deviceEnv=<its id>`.
2. `url` or `urlFromLog`, and `viewport`: once the origin answers, open it in a new browser tab at `viewport`, emulating touch if possible.
3. Otherwise: skip it, saying why.

Poll the log, then screenshots, every 30 s for up to 20 min. A failed build ends the run; its log tail is the only finding.

**Exit gate:** app on screen, or build failure recorded.

## 3. Play

- Be the persona: read only the screen, never code or guide; pursue the journey's goal. Screenshot each step, reading the console or launch log; at most 60 actions per target.
- Injected input lags: wait 2 s before each screenshot; on a simulator hold taps 0.15 s. Record "did nothing" only if a later screenshot agrees; retype text sent before the caret. Drop friction you can't reproduce.
- In a browser, follow the repository's preview rules; list touch-only gestures the journey needs as `notJudged`, never as findings.
- Push past friction. Record each with step, expected, observed and screenshot, graded first match wins:
  1. **Blocker:** the goal is unreachable, data is lost or wrong, or the app crashes or freezes.
  2. **Confusion:** you hesitated, guessed, a control did nothing or logged an error, or an icon had no label.
  3. **Mismatch:** it differs across screens or targets, or the layout misfits (clipped, overlapping, tiny targets).
  4. **Polish:** it works but costs a needless step.

**Exit gate:** journey done or abandoned on each target; findings have screenshots.

## 4. Clean up

Per target, even after a failure: SIGINT your launch process, wait up to 30 s, then TERM only processes you started; close your tabs and shut down your simulator, never another.

**Exit gate:** none of your processes, tabs or simulators remain.

## 5. File

- Merge findings across targets; keep the top `maxIssues` by grade.
- Search issues by screen and symptom (`gh issue list --state all --search`), first match wins:
  1. Open match: comment once with new evidence, if any.
  2. Closed within 30 days: a new `type:bug` regression issue linking it.
  3. No match: a new issue.
- Captures: commit screenshots to orphan `capturesBranch` at `runs/<date>-<persona>/<n>-<target>.png` (`gh api -X PUT repos/<repo>/contents/<path>`); embed them as below. If a workflow's `push` trigger matches it, describe screens instead: captures never start CI.
- A new issue: title `<type>(<area>): <outcome for the user>`; `type:bug` when it breaks a product promise or loses data, else `type:story`; `lane:proposed`, for the Reviewer under `reviewerLanes`, else the owner. Only now read code: trace the screen's text to the code drawing it for the scope packet.

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

- With a `project`, `gh project item-add` each new issue. Make it a sub-issue of the open epic naming its area, else of `epic`.

**Exit gate:** each finding filed, commented or dropped with a reason.

## 6. Report

Append `{"date", "persona", "journey", "targets", "issues", "notJudged", "outcome"}` as one line to `log.jsonl` on `capturesBranch`.

At most 8 lines:

```markdown
**Summary:** <persona>, <journey>, <targets>: #<n> Blocker (opened), #<m> Confusion (commented). Not judged: <notJudged>.
**Decision:** #<n> awaits its lane; I recommend `lane:afk`.
```

**Exit gate:** log line committed, report sent.
