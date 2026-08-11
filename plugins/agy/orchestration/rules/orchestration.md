# Antigravity Native Orchestration Rules

Use the portable `orchestrate-delivery` skill for delivery orchestration across bounded project changes, enhanced with Antigravity native harness capabilities (interactive artifacts, subagent delegation, background command management, and native Proceed buttons).

---

## 1. Project Configuration Discovery

Before executing any orchestration phase, inspect the target repository root for `.agy/config.json`.
- Parse configuration overrides for persona rules, test frameworks, and review behavior:
  ```json
  {
    "orchestration": {
      "enforce_hexagonal": true,
      "enforce_ddd": true,
      "require_security_audit": true,
      "max_autonomous_retries": 3
    }
  }
  ```
- If `.agy/config.json` is missing or unreadable, fall back to safe defaults (`enforce_hexagonal: true`, `enforce_ddd: true`, `require_security_audit: true`, `max_autonomous_retries: 3`).

---

## 2. Product Owner Refinement & Native UI Approval (`DEFINE` / `SPECIFY` / `PLAN`)

The human operator acts as **Product Owner** during initial specification refinement.
- At the start of `DEFINE`, read `vcs` to create and checkout a dedicated short-lived feature branch off current `main`/trunk for the delivery scope. Do not execute delivery phases or accumulate changes directly on `main` or an unassigned dirty branch.
- When `SPECIFY / GRILL` completes and `PLAN` constructs the Directed Acyclic Graph (DAG) of task slices, present `implementation_plan.md` with `RequestFeedback: true` and `UserFacing: true`.
- Antigravity renders the native IDE **Proceed** button and feedback UI.
- Include user guidance micro-copy:
  > **Review Instructions for Product Owner:**
  > - Review the `implementation_plan.md` in the interactive panel.
  > - Click **Proceed** at top right to authorize autonomous execution by the agent team.
- When the user clicks **Proceed**, transition into autonomous execution (`DISPATCH`).

---

## 3. Subagent Persona Delegation (`DISPATCH` & `REVIEW`)

To prevent self-review bias and leverage specialized team roles, the orchestrator MUST invoke persona subagents via `invoke_subagent`:

1. **`developer` Subagent** ([agents/developer.md](../agents/developer.md)):
   - Dispatched during `DISPATCH` to execute code within an isolated Git worktree.
2. **`quality-engineer` Subagent** ([agents/quality-engineer.md](../agents/quality-engineer.md)):
   - Dispatched during `COLLECT / VERIFY` to run deterministic verification (`python3 scripts/project-verify.py verify`) and test coverage checks.
3. **`solution-architect` Subagent** ([agents/solution-architect.md](../agents/solution-architect.md)):
   - Dispatched during `REVIEW` to audit domain purity (DDD aggregate invariants) and Hexagonal layer isolation.
4. **`security-auditor` Subagent** ([agents/security-auditor.md](../agents/security-auditor.md)):
   - Dispatched during `REVIEW` to audit OWASP vulnerabilities, secret leaks, and command injection risks.

---

## 4. Autonomous Self-Correction Rework Loop

During `COLLECT / VERIFY` and `REVIEW`, when a verifier or reviewer persona rejects a slice (`VERIFICATION_FAILED`, `CORRECT_EXECUTE`, `CORRECT_PLAN`, or `SECURITY_VULNERABILITY_FOUND`):
- Increment slice `attempt_count`.
- If `attempt_count <= max_autonomous_retries` (default 3), automatically re-dispatch the `developer` subagent with the exact failure payload. DO NOT stop or request human input during intermediate retries.
- Update the native live progress artifact `walkthrough.md` (`UserFacing: true`) showing retry attempt progress.
- If `attempt_count > max_autonomous_retries`, stop execution, log failure state in `walkthrough.md`, and return decision to the Product Owner.

---

## 5. Stage 7 Native `ReviewRequest` & Interactive Merge Approval (`SHIP / RETURN`)

Once all DAG slices pass deterministic verification and persona reviews:
- Prepare the native `ReviewRequest` artifact on the short-lived task branch linking the tracker Delivery Record, verification logs, and `walkthrough.md`.
- Present `ReviewRequest` with `RequestFeedback: true` to the Product Owner.
- Provide interactive merge prompt instructions:
  > **Delivery Ready for Merge:**
  > - All persona reviews (`quality-engineer`, `solution-architect`, `security-auditor`) passed cleanly.
  > - Click **Proceed** to authorize branch merge into `main`.
- **Merge Guardrail**: Executors must NEVER merge, approve, or force-push protected default branches (`main`). The Product Owner alone retains merge authority.
