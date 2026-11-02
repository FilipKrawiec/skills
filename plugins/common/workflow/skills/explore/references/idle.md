# Idle Explore

An AFK run plays `explore` unattended when `workflow.mjs afk start` exits 4: no work was free for it, no other live run is working and the last idle explore began at least the CLI default `idleHours` ago. The record is `afk-idle-explore.json` in the repository's git common directory.

- Use only browser runs unless the brief names others: a simulator boot can stall a host other runs share.
- Pick the persona and journey as phase 1 says, with no caller's choice: the journey never run, else the one run longest ago.
- Every new issue needs its lane and a parent epic, so the next run of that epic sees it; without one, report it as an owner wait.

- Grounded bugs go straight to AFK and automated Reviewer eligibility decides the rest, so the run waits on nobody. Report `Done:` with the issues filed, unless a Blocker breaks a shipped promise: then flag it to the owner on the issue.
- End the run as the AFK host's task says; there is no epic to release.
