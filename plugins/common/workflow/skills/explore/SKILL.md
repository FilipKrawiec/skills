---
name: explore
description: Use when a scheduled task or the owner asks for an exploratory usability pass, meaning someone drives the running app as one of its users on a simulator and files the friction they meet as issues.
allowed-tools: Read Bash
---

# Explore

Use the app as one of its users would and file what slows or confuses them. Never edit, commit or push code.

Settings, from `.github/lanes.json`: `repo`, `project`, and `explore`:

- `personas`: a Markdown file; each `## <persona>` says who they are, how they sign in, and lists `### <journey>` tasks, each with a goal.
- `targets`: `{"<name>": {"launch": "<command>", "device": "<simulator name>"}}`; `launch` starts the app on the simulator whose id is in the environment variable `deviceEnv`.
- `capturesBranch` (default `explore-captures`), `maxIssues` (default 3), `worktree` (default `.worktrees/explore`).

## 1. Prepare

- Never touch the main checkout: it holds the owner's work. Create (`git worktree add --detach <worktree> origin/main`) or refresh it: fetch `origin main`, `checkout --force --detach origin/main`, `clean -fdq`.
- Read `log.jsonl` from `capturesBranch` (missing on the first run). Pick a journey of the caller's persona, if named, first match wins:
  1. The journey the caller names.
  2. A journey never run.
  3. The journey run longest ago.

**Exit gate:** the worktree at origin/main; persona, journey and targets chosen.

## 2. Launch

One target at a time:

- Never use a physical device. Boot an available simulator matching `device`, and start `launch` in the worktree in the background with `deviceEnv=<simulator id>`, logging to a file. Record its process id.
- Poll screenshots every 30 s, up to 20 min. A failed build ends the run; its log tail is the only finding.

**Exit gate:** the app on screen, or the build failure recorded.

## 3. Play

- Be the persona: read only the screen, never the code or guide, and pursue the journey's goal with the host's simulator tools. Screenshot each step; at most 60 actions per target.
- Injected input lags: hold each tap about 0.15 s and wait 2 s before each screenshot. Record "did nothing" only when a later screenshot agrees; retype text sent before the caret showed. Drop friction you can't reproduce: it is the tool's.
- Push past friction. Record each with its step, expected, observed and screenshot, graded first match wins:
  1. **Blocker:** the goal can't be reached, or data is lost or wrong.
  2. **Confusion:** you hesitated, guessed, a control did nothing, or an icon had no label.
  3. **Mismatch:** the same thing differs across screens or targets, or the layout misfits (clipped, overlapping, tiny targets).
  4. **Polish:** it works but costs a step that could go.

**Exit gate:** the journey done or abandoned on each target, findings with screenshots.

## 4. Clean up

Per target, also after a failure: SIGINT the launch process and wait up to 30 s (it may save state). TERM any process left whose command line holds the worktree path. Shut down the simulator you booted, never one you didn't.

**Exit gate:** no launch process or booted simulator of yours remains.

## 5. File

- Merge a finding seen on several targets. Keep the top `maxIssues` by grade.
- Search open and closed issues for the screen and symptom (`gh issue list --state all --search "<words>"`), first match wins:
  1. Open match: comment once with any new evidence; else drop it.
  2. Closed within 30 days: a new `type:bug` issue linking it, as a regression.
  3. No match: a new issue.
- Captures: commit screenshots to the orphan `capturesBranch` at `runs/<date>-<persona>/<n>-<target>.png` with `gh api -X PUT repos/<repo>/contents/<path>`, and embed `https://github.com/<repo>/blob/<branch>/<path>?raw=true`. If a workflow's `push` trigger matches that branch, describe the screen instead: a capture must never start CI.
- A new issue follows the repository's issue form: title `<type>(<area>): <outcome for the user>`; `type:bug` when it contradicts what the product promises or loses data, else `type:story`; `lane:proposed`, so the owner decides. Only now read the code: trace the screen's visible text to the code that draws it for the scope packet.

````markdown
### Executive summary
A band leader can't tell which setlist is live: both look the same on iPhone.

**Scope:** setlist list; no data changes.
**Decision:** Recommend `lane:proposed`; owner decides.

### Acceptance criteria

- [ ] The live setlist is marked in words on iPhone and iPad.

### Estimate
S.

```scope
{"paths": ["app/lib/setlists/"], "dependencies": []}
```

<details>
<summary>Steps, expected, observed</summary>

iPhone, band leader: Setlists → … Expected …; observed …

![step 3](https://github.com/<repo>/blob/explore-captures/runs/…/3-iphone.png?raw=true)

</details>

<!-- explore-finding persona=band-leader journey=plan-sunday-set -->
````

- With a `project`, add each new issue to it: `gh project item-add`.

**Exit gate:** each finding is an issue, a comment, or dropped with its reason.

## 6. Report

Append `{"date", "persona", "journey", "targets", "issues", "outcome"}` as one line to `log.jsonl` on `capturesBranch`.

At most 8 lines:

```markdown
**Summary:** band-leader, plan-sunday-set, ipad + iphone: #474 Blocker (opened), #475 Mismatch (opened).
**Decision:** #474 and #475 await your lane; I recommend `lane:afk`. Or: "Nothing needed."
```

**Exit gate:** the log line committed and the report sent.
