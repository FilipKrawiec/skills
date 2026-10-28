# Idle Explore

An AFK run plays `explore` unattended when `lanes.py start` exits 4: no work was free for it, lanes.json `explore.idleHours` is set, no other live run holds the idle explore on this host and the last one began at least `idleHours` ago. The record is `afk-idle-explore.json` in the repository's git common directory.

- Play only browser targets unless the brief names others: a simulator boot can stall a host other runs share.
- Pick the persona and journey as phase 1 says, with no caller's choice: the journey never run, else the one run longest ago.
- Every new issue needs `lane:proposed` and a parent epic, so the next run of that epic sees it; without one, report it as an owner wait.

- Under `reviewerLanes` the Reviewer's eligibility check decides the lane, so the run waits on nobody. Report `Done:` with the issues filed, unless a Blocker breaks a shipped promise: then flag it to the owner on the issue.
- Without `reviewerLanes` each new issue waits on the owner's lane: report it as an owner wait.
- End the run as the AFK host's task says; there is no epic to release.
