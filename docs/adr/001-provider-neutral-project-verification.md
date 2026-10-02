# ADR-001: Provider-Neutral Project Verification Baseline

## Decision

This is the single active operating-model baseline. The public repository hosts portable skills with encapsulated reference guidance under `plugins/common/`; it contains no proprietary, client, or secret content.

Delivery follows the seven-phase cycle of the workflow plugin: 01 Define, 02 Spec, 03 Plan, 04 Execute, 05 Review, 06 Ship, 07 Improve. Each phase has one skill, and the optional Project board has one column per phase (`plugins/common/workflow/references/board.md`). Work is planned as cohesive slices, not artificial microtasks. Each slice gets one isolated short-lived-branch linked Git worktree from a declared base revision; a named isolated copy is the non-Git fallback. Parallel execution is limited to independent slices with non-overlapping ownership and dependencies.

Model and harness routing stays local to each host, not in project-committed profiles. A slice whose executor fails, is unavailable or is unsuitable goes back to planning; there is no automatic cross-harness retry and no fabricated execution.

The shared Python CLI (`scripts/project-verify.py`) is the local and CI verification loop. It discovers `AGENTS.md` frontmatter declarations, executes defined lifecycle tasks, and validates Git worktree hygiene. It does not create worktrees, schedule tasks, manage packages, edit content, or interpret prose. Executors rerun the loop until the gate passes or return the slice.

AFK grants bounded autonomy across one complete slice. Executors may commit verified branches, push them, and publish/update Review Requests. Non-AFK work requires a Review Request; merge, approval, and force-push of protected/default branches remain user-authorized. A published Review Request links exactly one durable Delivery Record in the configured tracker; the configured host integration may close or update it on merge.

## Consequences

- `scripts/project-verify.py verify` is the executable deterministic gate reading `AGENTS.md` frontmatter lifecycle tasks.
- The delivery cycle skills (`spec`, `plan`, `tdd`, `vcs`, `review`, `ship`, `improve`) and the unattended runner `afk` live in this repository's workflow plugin. FilipKrawiec/devcontainer's `filipkrawiec-sdlc` package keeps only project initialisation; host adapters remain outside the common packages.
- The retired Autonomous SDLC implementation and interim baseline records were removed during release-candidate cleanup; Git history retains them if needed.
