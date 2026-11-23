# Score and approve

An interactive plan for the owner goes through these steps; a planner started by `drive` never does.

## 1. Score reproducibility

Score the plan yourself; start no scorer subagent. Reread it as an agent that has only the plan and the issue: for each step, answer why it exists and how you would do it (paths, test, command), and mark the step `guess` where the plan does not settle either. The score is the share of steps marked `ok`. Below 100%, sharpen each guessed step, asking the developer the why or how question it raised, and score again. A plan below 100% after two revisions goes to the owner with the guessed steps.

**Exit gate:** 100% score, recorded with the plan.

## 2. Approve and record

Post one `## Plan` issue comment, or a compact in-chat plan for small direct work, with the steps, decisions, risks, manual test steps and `Reproducibility: 100% (<n> steps)`. Update that exact comment by ID; never use `--edit-last`.

The developer approves the scored plan.

After approval, delivery runs through `drive <issue>` in the owner's session: it starts the work in an isolated worktree, briefs the implementer with the issue and the plan link, opens the draft PR and runs review. Never edit project files from the planning session.

**Exit gate:** approved plan linked, or the owner question it waits on.
