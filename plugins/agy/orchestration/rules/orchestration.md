# Antigravity Orchestration Rules

Use the portable `orchestrate-delivery` skill for delivery orchestration across bounded project changes.

## 1. Project Configuration Discovery

Before executing any orchestration phase, inspect the target repository root for `.agy/config.json`.
- If present, parse user configuration overrides for architectural rules, test frameworks, and review behavior:
  ```json
  {
    "orchestration": {
      "enforce_hexagonal": true,
      "enforce_ddd": true,
      "require_four_eyes_review": true
    }
  }
  ```
- If `.agy/config.json` is missing or unreadable, fall back to safe default settings (`enforce_hexagonal: true`, `enforce_ddd: true`, `require_four_eyes_review: true`).

## 2. Native UI Specification Approval

When `SPECIFY / GRILL` completes and `PLAN` produces a `DeliveryContract` or `ImplementationPlan`, present the artifact with `RequestFeedback: true` (`UserFacing: true`).
- Include human review instructions micro-copy in the natural language response:
  > **Review Instructions for Human Operator:**
  > - Review the `ImplementationPlan` / `DeliveryContract` in the interactive panel.
  > - Add inline comments on specific lines if changes are required.
  > - Click **Proceed** at the top right to approve execution.
- Antigravity will render the native IDE/App **Proceed** button and feedback UI.
- When the user clicks **Proceed** or accepts the artifact, proceed to task slice `DISPATCH`.
- If the user provides review comments or requests changes, treat this as a rework request and update the specification/plan.

## 3. Unbiased Subagent Code Review (Four-Eyes Control & Fallback Protocol)

To prevent self-review bias and strictly enforce Segregation of Duties, the agent that performed task slice execution MUST NOT perform `REVIEW` directly in the same conversation context.
- When entering the `REVIEW` phase, the orchestrator MUST use `invoke_subagent` to launch the dedicated `orchestration-reviewer` subagent defined in [agents/orchestration-reviewer.md](../agents/orchestration-reviewer.md).
- Pass `Role: "Adversarial Code Auditor & Quality Engineer"` and load the system prompt from [agents/orchestration-reviewer.md](../agents/orchestration-reviewer.md).
- **Subagent Fallback Protocol**: If `invoke_subagent` fails or is restricted by environment limits, the orchestrator MUST gracefully fall back to an isolated inline review in a fresh turn, notifying the user:
  *"Subagent conversation isolation unavailable; conducting inline code audit..."*
- The subagent (or fallback reviewer) inspects `.agy/config.json`, actively invokes enabled skills (`ddd`, `hexagonal-architecture`, `tdd`, `vcs`), conducts the review, and returns the review decision to the orchestrator.
