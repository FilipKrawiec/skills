# Antigravity Autonomous SDLC Rules

Use the standalone `sdlc` skill for repository changes that require lifecycle coordination.

## 1. Native UI Specification Approval

When `RequestApproval(SPECIFICATION)` is reached during `REFINE`, present the `DeliveryContract` as an Antigravity artifact with `RequestFeedback: true` (`UserFacing: true`).
- Antigravity will render the native IDE/App **Proceed** button and feedback UI.
- When the user clicks **Proceed** or accepts the artifact, record `SpecificationApproved`.
- If the user provides review comments or requests changes, treat this as `SpecificationRejected` with the user feedback as `ReworkRequest`.

## 2. Single Approval Boundary & Execution Autonomy

Once `SpecificationApproved` is granted, the transition `PLAN` -> `EXECUTE` -> `REVIEW` is **100% autonomous by default**.
- Do NOT create a second approval gate or pause for another review button during `PLAN`.
- `PLAN` constructs the internal execution plan and transitions directly to `EXECUTE` and `REVIEW` without stopping for manual human confirmation.

## 3. Unexpected Contradiction Guard

If the `PLAN` phase uncovers an **unexpected contradiction** or architectural conflict between the approved `DeliveryContract` and the actual codebase that was NOT discovered during `REFINE`:
- Immediately suspend execution and emit a `BlockerReport`.
- Present the contradiction and proposed resolution to the user for explicit decision before applying code edits.

## 4. Unbiased Subagent Code Review (Four-Eyes Control)

To prevent self-review bias and strictly enforce Segregation of Duties, the agent that performed `EXECUTE` MUST NOT perform `REVIEW` directly in the same conversation context.
- When entering the `REVIEW` phase, the orchestrator MUST use `invoke_subagent` to launch the dedicated `sdlc-reviewer` subagent defined in [agents/sdlc-reviewer.md](agents/sdlc-reviewer.md).
- Pass `Role: "Adversarial Code Auditor & Quality Engineer"` and load the system prompt from [agents/sdlc-reviewer.md](agents/sdlc-reviewer.md).
- The subagent actively invokes and enforces `ddd` and `hexagonal-architecture` skills (including their references), conducts the review in an isolated conversation context, and returns the `ReviewDecision` work product to the orchestrator.
