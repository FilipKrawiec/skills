# ADR-001: Provider-Neutral Orchestration Baseline

## Decision

This is the single active operating-model baseline. The public repository co-locates portable skills and Central Knowledge at `knowledge/`; it must contain no proprietary, client, or secret content. Project Knowledge stays in each project's `.project-knowledge/` root, uses sparse overrides, and declares active technology profiles explicitly.

The provider-neutral, code-free orchestrator follows DEFINE → SPECIFY/GRILL → PLAN → DISPATCH → COLLECT/VERIFY → REVIEW → SHIP/RETURN. It plans cohesive delivery slices, not artificial microtasks, and never edits implementation code. Each slice gets one isolated short-lived-branch linked Git worktree from a declared base revision; a named isolated copy is the non-Git fallback. Parallel execution is limited to independent slices with non-overlapping ownership and dependencies.

Routing uses local orchestrator configuration, not project-committed profiles. Its configurable ordinary-slice default is currently Antigravity (AG). The orchestrator can select another harness before dispatch when the slice warrants it. If the selected executor fails, is unavailable, or is unsuitable, it returns the slice for review/replanning—no automatic cross-harness retry and no fabricated execution.

The shared Python CLI is the local and CI verification loop. It validates Central/Project Knowledge, project profiles, task evidence, version-2 packet provenance, and declared native profile checks; it runs declared native checks and reports deterministic condition/remedy output. It does not create worktrees, schedule tasks, manage packages, edit content, or interpret prose. Executors rerun the loop until the gate passes or return the slice.

AFK grants bounded autonomy across one complete slice. Executors may commit verified branches, push them, and publish/update Review Requests. Non-AFK work requires a Review Request; merge, approval, and force-push of protected/default branches remain user-authorized. A published Review Request links exactly one durable Delivery Record in the configured tracker; the configured host integration may close or update it on merge.

## Consequences

- `scripts/project-verify.py verify --root <project> --knowledge-root <knowledge>` is the execution gate; `check` validates task evidence and packet provenance; `orchestrator-config-check` validates local routing configuration.
- The active portable plugin is `plugins/common/orchestration/`; host adapters and executor control paths remain outside it.
- The retired Autonomous SDLC implementation and interim baseline records were removed during release-candidate cleanup; Git history retains them if needed.
