# Minimal Task Packet Specification

Use one concise packet per cohesive, bounded delivery slice. One executor persona retains the slice context end-to-end: understand local context, implement, use TDD where relevant, run and fix the verification loop, and return reviewable evidence. Do not split test-writing, implementation, and verification merely to create delegation boundaries.

```text
Task: <stable task name>
Intent: <business/specification outcome>
Slice: <cohesive end-to-end outcome>
Assigned persona: <developer | quality-engineer | solution-architect | security-auditor>
Executor: <selected available harness>
Executor rationale: <configured default, or complexity/local-tool/repository-fit/autonomy basis>
Routing config: <validated configuration path and execution policy>
Workspace: <linked Git worktree path, or named isolated copy>
Workspace kind: <git-worktree or isolated-copy>
Repository: <repository identity>
Base revision: <Git commit/ref, or non-Git source snapshot>
Affected paths: <non-overlapping ownership boundary>
Dependencies: <completed task names, or none>
DAG node: <node identifier in plan dependency graph>
Attempt count: <current execution attempt N, starting at 1>
Max retries: <maximum autonomous retry ceiling, default 3>
Parallel: <true only when dependencies and affected paths do not clash>
Allowed scope: <files, component, or behavior boundary>
Inputs: <relevant specification and Central/Project Knowledge identifiers>
Acceptance criteria: <observable outcomes>
Verification loop: <exact CLI command and expected pass evidence>
Verifier evidence: <recorded command output or artifact>
Delivery Record: <configured tracker identifier and durable reference; intent, criteria, boundaries, verification context>
Review Request: <configured review-provider identifier and published status/reference; links exactly one Delivery Record>
AFK: <not AFK, or granted autonomy boundaries>
Return immediately when: <material ambiguity, risk, or boundary change>
```

The orchestrator loads its configurable default from local routing configuration. The current configuration is Antigravity (AG), but it is not a dependency of this portable contract. It selects another executor only before dispatch when practical slice complexity, required local tools, repository fit, or autonomy boundary warrant it. `Executor rationale` makes the choice reviewable. If the selected executor fails, is unavailable, or unsuitable after selection, the orchestrator returns the slice for review/replanning; it does not automatically retry with another harness or fabricate execution. The packet records the validated local config path and policy without committing local availability facts to the project. The orchestrator creates and cleans up a linked Git worktree and short-lived branch from `Base revision` for each slice. Do not use the primary checkout for implementation. For a Git worktree packet, `Base revision` must be an ancestor of checked-out `HEAD`; verification requires a clean worktree and rejects committed `base..HEAD` paths outside normalized `Affected paths`. For a non-Git project, `isolated-copy` records the named source snapshot instead. The packet permits end-to-end delivery only within `Affected paths`, `Allowed scope`, and its named `Workspace`. `parallel: true` is allowed only for dependency-independent slices with non-overlapping paths; direct or transitive dependencies are serialized.

When the specification and plan become durable, the orchestrator creates exactly one durable Delivery Record for this cohesive slice in the configured tracker before publishing its Review Request. The Delivery Record records business intent, acceptance criteria, plan/task boundaries, and relevant verification context. Every published Review Request links exactly one Delivery Record; the configured host integration may close or update it on merge. Record generic tracker/review-provider identifiers and non-empty references; the verifier checks this structure only for a published Review Request. The orchestrator does not hard-code a tracker or review-provider API or flow. This does not apply to chat-only ideation, pure local experiments, or unpushed work. An existing Review Request that predates this rule is a historical exception pending user choice; do not create its Delivery Record without explicit user authorization.

The executor returns a change summary, one execution outcome (`completed`, `blocked`, or `escalated`), verification-loop evidence, any blocker or residual risk, and Review Request status. Packet `Verifier evidence` is a reviewable reference; the shared `verify` command is the executable gate. AFK applies to the complete bounded slice, never only one artificial substep. It may commit, push, and publish or update a Review Request as normal delivery. Non-AFK work requires a Review Request as its safety/review boundary. No executor merges, approves, or force-pushes a protected/default branch without explicit user authorization.
