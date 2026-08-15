# Antigravity Native SDLC Rules

Enhance the provider-neutral `deliver` workflow with Antigravity native IDE harness capabilities (interactive UI artifacts, subagent persona delegation via `invoke_subagent`, autonomous self-correction loops, and interactive merge approval).

---

## 1. Project Configuration & GitHub Prerequisites

1. Verify GitHub CLI authentication via `gh auth status` (scopes: `repo`, `read:org`, `project`).
2. Inspect target repository root for `.agy/config.json` overrides:
   ```json
   {
     "orchestration": {
       "enforce_hexagonal": true,
       "enforce_ddd": true,
       "require_security_audit": true,
       "max_autonomous_retries": 3,
       "github_projects_enabled": true
     }
   }
   ```
   Apply safe defaults if unconfigured (`enforce_hexagonal: true`, `enforce_ddd: true`, `require_security_audit: true`, `max_autonomous_retries: 3`, `github_projects_enabled: true`).

---

## 2. Interactive Artifact & Planning Protocol

- **Implementation Plan Gate**: Generate technical `implementation_plan.md` with `RequestFeedback: true` and `UserFacing: true`. Antigravity renders the native IDE **Proceed** button and feedback UI.
- **Progress Tracking**: Record execution and review evidence continuously in `walkthrough.md` (`UserFacing: true`).
- **Wait for User Approval**: Stop execution and wait for the user to click **Proceed** before dispatching task slices.

---

## 3. Subagent Persona Delegation

When the user approves the plan, dispatch dedicated persona subagents via `invoke_subagent` according to delivery stage:

| Stage | Persona Template | Role & Execution Focus |
| :--- | :--- | :--- |
| `DISPATCH` / `IMPLEMENT` | [developer](../agents/developer.md) | Executes TDD implementation inside an isolated Git worktree. |
| `COLLECT / VERIFY` | [quality-engineer](../agents/quality-engineer.md) | Executes deterministic verification gates and audits test assertions. |
| `REVIEW` | [solution-architect](../agents/solution-architect.md) | Audits domain purity and Hexagonal layer isolation boundaries. |
| `REVIEW` | [security-auditor](../agents/security-auditor.md) | Audits OWASP vulnerabilities, shell injections, and secret leaks. |
| `REVIEW` | [orchestration-reviewer](../agents/orchestration-reviewer.md) | Comprehensive four-eyes code and architecture audit. |

---

## 4. Autonomous Self-Correction Loop

When a verifier or reviewer persona rejects a slice (`VERIFICATION_FAILED`, `CORRECT_EXECUTE`, `CORRECT_PLAN`, or `SECURITY_VULNERABILITY_FOUND`):
1. Increment slice `attempt_count`.
2. If `attempt_count <= max_autonomous_retries` (default 3), re-dispatch the `developer` subagent with the exact failure payload. Do not prompt the user during intermediate retries.
3. Update `walkthrough.md` with retry diagnostics.
4. If retries are exhausted, stop and escalate failure logs to the Product Owner.

---

## 5. Interactive PR Review & Merge Guardrail

1. Create Pull Request (`gh pr create`) linking `Closes #<id>`.
2. Submit persona PR review comments (`gh pr review <pr-number> --comment`) with `walkthrough.md` evidence.
3. Present native IDE `ReviewRequest` with `RequestFeedback: true` linking PR and Issue.
4. **Merge Guardrail**: Executors must NEVER merge, approve, or force-push protected default branches (`main`). Present the interactive merge prompt for user authorization (`gh pr merge --squash --delete-branch`). Upon merge, clean up local worktrees (`git worktree remove`) and prune remote tracking branches (`git remote prune origin`).

