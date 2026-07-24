# Antigravity Autonomous SDLC Rules

Use the standalone `sdlc` skill for repository changes that require lifecycle coordination.

## 0. Stage & Phase Callable Commands

Every SDLC stage and phase is directly callable from Antigravity:

- `/sdlc`: Full lifecycle orchestrator.
- `/sdlc-define`, `/sdlc-refine`, `/sdlc-execute`, and `/sdlc-improve`: Stage commands.
- `/sdlc-plan`, `/sdlc-review`, and `/sdlc-ship`: EXECUTE-stage phase commands.

## 1. Project Configuration Discovery

Before executing any phase, inspect the target repository root for `.agy/config.json`.
- If present, parse user configuration overrides for architectural rules, test frameworks, and review behavior:
  ```json
  {
    "sdlc": {
      "enforce_hexagonal": true,
      "enforce_ddd": true,
      "require_four_eyes_review": true,
      "test_framework": "jest"
    }
  }
  ```
- If `.agy/config.json` is missing or unreadable, fall back to safe default settings (`enforce_hexagonal: true`, `enforce_ddd: true`, `require_four_eyes_review: true`).

## 2. Native UI Specification Approval

When `RequestApproval(SPECIFICATION)` is reached during `REFINE`, present the `DeliveryContract` as an Antigravity artifact with `RequestFeedback: true` (`UserFacing: true`).
- Include human review instructions micro-copy in the natural language response:
  > **Review Instructions for Human Operator:**
  > - Review the `DeliveryContract` in the interactive panel.
  > - Add inline comments on specific lines if changes are required.
  > - Click **Proceed** at the top right to approve execution.
- Antigravity will render the native IDE/App **Proceed** button and feedback UI.
- When the user clicks **Proceed** or accepts the artifact, record `SpecificationApproved`.
- If the user provides review comments or requests changes, treat this as `SpecificationRejected` with the user feedback as `ReworkRequest`.

## 3. Single Approval Boundary & Execution Autonomy

Once `SpecificationApproved` is granted, the transition `PLAN` -> `EXECUTE` -> `REVIEW` is **100% autonomous by default**.
- Do NOT create a second approval gate or pause for another review button during `PLAN`.
- `PLAN` constructs the internal execution plan and transitions directly to `EXECUTE` and `REVIEW` without stopping for manual human confirmation.

## 4. Unexpected Contradiction Guard

If the `PLAN` phase uncovers an **unexpected contradiction** or architectural conflict between the approved `DeliveryContract` and the actual codebase that was NOT discovered during `REFINE`:
- Immediately suspend execution and emit a `BlockerReport`.
- Present the contradiction and proposed resolution to the user for explicit decision before applying code edits.

## 5. Unbiased Subagent Code Review (Four-Eyes Control & Fallback Protocol)

To prevent self-review bias and strictly enforce Segregation of Duties, the agent that performed `EXECUTE` MUST NOT perform `REVIEW` directly in the same conversation context.
- When entering the `REVIEW` phase, the orchestrator MUST use `invoke_subagent` to launch the dedicated `sdlc-reviewer` subagent defined in [agents/sdlc-reviewer.md](agents/sdlc-reviewer.md).
- Pass `Role: "Adversarial Code Auditor & Quality Engineer"` and load the system prompt from [agents/sdlc-reviewer.md](agents/sdlc-reviewer.md).
- **Subagent Fallback Protocol**: If `invoke_subagent` fails or is restricted by environment limits (e.g. subagent depth limit or sandbox restriction), the orchestrator MUST gracefully fall back to an isolated inline review in a fresh turn, notifying the user:
  *"Subagent conversation isolation unavailable; conducting inline code audit..."*
- The subagent (or fallback reviewer) inspects `.agy/config.json`, actively invokes enabled skills (`ddd`, `hexagonal-architecture`, `grill-with-docs`, `tdd`, `vcs`), conducts the review, and returns the `ReviewDecision` work product to the orchestrator.
