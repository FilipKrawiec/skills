# Minimal Task Packet

Use one concise packet per cohesive, bounded delivery slice. One executor retains the slice context end-to-end: understand local context, implement, use TDD where relevant, run and fix the verification loop, and return reviewable evidence. Do not split test-writing, implementation, and verification merely to create delegation boundaries.

```text
Task: <stable task name>
Intent: <business/specification outcome>
Slice: <cohesive end-to-end outcome>
Executor: <selected available harness>
Executor rationale: <configured default, or complexity/local-tool/repository-fit/autonomy basis>
Routing config: <local config path and validated default/failure policy>
Workspace: <linked Git worktree path, or named isolated copy>
Workspace kind: <git-worktree or isolated-copy>
Repository: <repository identity>
Base revision: <Git commit/ref, or non-Git source snapshot>
Affected paths: <non-overlapping ownership boundary>
Dependencies: <completed task names, or none>
Parallel: <true only when dependencies and affected paths do not clash>
Allowed scope: <files, component, or behavior boundary>
Inputs: <relevant specification and Central/Project Knowledge identifiers>
Acceptance criteria: <observable outcomes>
Verification loop: <exact CLI command and expected pass evidence>
Verifier evidence: <recorded command output or artifact>
Delivery Record: <exactly one durable configured-tracker URL/id; intent, criteria, boundaries, verification context>
Review Request: <task-branch review URL/id; links exactly one Delivery Record>
AFK: <not AFK, or granted autonomy boundaries>
Return immediately when: <material ambiguity, risk, or boundary change>
```

The orchestrator loads its configurable default from local routing configuration. The current configuration is Antigravity (AG), but it is not a dependency of this portable contract. It selects another executor only before dispatch when practical slice complexity, required local tools, repository fit, or autonomy boundary warrant it. `Executor rationale` makes the choice reviewable. If the selected executor fails, is unavailable, or unsuitable after selection, the orchestrator returns the slice for review/replanning; it does not automatically retry with another harness or fabricate execution. The packet records the validated local config path and policy without committing local availability facts to the project. The orchestrator creates and cleans up a linked Git worktree and short-lived branch from `Base revision` for each slice. Do not use the primary checkout for implementation. For a non-Git project, `isolated-copy` records the named source snapshot instead. The packet permits end-to-end delivery only within `Affected paths`, `Allowed scope`, and its named `Workspace`. Parallel execution is limited to genuinely independent cohesive slices.

When the specification and plan become durable, the orchestrator creates exactly one durable Delivery Record for this cohesive slice in the configured tracker before publishing its Review Request. The Delivery Record records business intent, acceptance criteria, plan/task boundaries, and relevant verification context. Every published Review Request links exactly one Delivery Record; the configured host integration may close or update it on merge. The orchestrator does not hard-code a tracker or review-provider API or flow. This does not apply to chat-only ideation, pure local experiments, or unpushed work. An existing Review Request that predates this rule is a historical exception pending user choice; do not create its Delivery Record without explicit user authorization.

The executor returns a change summary, one execution outcome (`completed`, `blocked`, or `escalated`), verification-loop evidence, any blocker or residual risk, and Review Request status. AFK applies to the complete bounded slice, never only one artificial substep. It may commit, push, and publish or update a Review Request as normal delivery. Non-AFK work requires a Review Request as its safety/review boundary. No executor merges, approves, or force-pushes a protected/default branch without explicit user authorization.
