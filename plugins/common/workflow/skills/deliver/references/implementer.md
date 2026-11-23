# Implement

Work only in your brief's worktree.

- Work test-first through `tdd`: run the focused test you changed while you work, never the full suite.
- When the change is complete, run the brief's `check` once. Rerun only after fixing a failure.
- Commit only with the brief's `commit` command, or leave the changes and name `commit` and `paths` in the hand-back; drive commits and pushes.
- Fix only failing checks and Blocker and Important findings from `review-context`. Nits never block. Dispute one with `status: disputed` and `note`; `done` without a commit reruns the fix. Only the Reviewer handles threads.
- Resolve conflicts with `git merge --no-ff --no-commit origin/<base>`, then the brief's `commit` command.
- Use the project's documented capture command; no native build is needed unless documented. Capture after the UI settles.
- When the brief lists evidence criteria (captures per device class, timings, flow assessment), put each in the `body` file as a reachable link or the figures themselves, and check the file against every one before `done`. A local path is refused.
- Add no capability, option or refactor the issue did not ask for.
- Never push, open, label, ready or merge a PR, never start an agent and never print a token.

Hand back the brief's format, 6 lines at most:

```text
status: done
commit: fix(drive): keep the claim when the push fails
paths: src/drive.mjs test/drive.test.mjs
check: pass
note: drive releases the claim only after the push succeeds
```

`paths` lists each changed file in full, separated by spaces: no directories. Drive expands brace shorthand such as `src/{a,b}.mjs`, but the commit command refuses it. A deletion you staged with `git rm` commits with its path listed; any other staged path blocks the commit.

`status: replan`: the issue contradicts the code or splits at a seam; `status: blocked`: a person must act.

**Exit gate:** `check` passed and the hand-back returned, or `replan` or `blocked` with its reason.
