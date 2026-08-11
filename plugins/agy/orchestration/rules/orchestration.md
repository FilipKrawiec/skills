# Antigravity Native Orchestration Rules

Use the portable `orchestrate-delivery` skill for delivery orchestration across bounded project changes, enhanced with Antigravity native harness capabilities (interactive artifacts, subagent delegation, background command management, GitHub CLI synchronization, and native Proceed buttons).

---

## 1. GitHub CLI Prerequisites & Project Configuration

Before executing any orchestration phase:
1. Verify GitHub CLI authentication via `gh auth status`. Ensure required scopes (`repo`, `read:org`, `project`) are present.
2. Inspect the target repository root for `.agy/config.json`.
   - Parse configuration overrides for persona rules, test frameworks, and review behavior:
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
   - Fall back to safe defaults (`enforce_hexagonal: true`, `enforce_ddd: true`, `require_security_audit: true`, `max_autonomous_retries: 3`, `github_projects_enabled: true`).

---

## 2. GitHub Issue & Project Board Synchronization (`DEFINE` & `REFINE`)

The human operator acts as **Product Owner** during specification refinement.
- **`DEFINE` Output & Mandatory Completion Gate**: Create a structured GitHub Issue (`gh issue create`) with type labels (`type:feature`, `type:story`, `type:task`, `type:bug`). Move Project item to **Backlog**. `DEFINE` MUST execute `gh issue create` and present the Issue link to the Product Owner as its completion output BEFORE technical `implementation_plan.md` drafting or code execution.
- **`REFINE` Output**: Conduct specification challenge (`grill-with-docs`), update issue description (`gh issue edit`), and post refinement comments (`gh issue comment`). Set Project status to **Backlog** (or **Blocked** if blocked).

---

## 3. Implementation Planning & Subagent Persona Delegation (`IMPLEMENT`)

Transition Project column to **In Progress**. Create feature branch `issue-<id>-<slug>` (`gh issue develop`).
- Construct local technical `implementation_plan.md` (`RequestFeedback: true`, `UserFacing: true`) for technical DAG task breakdown.
- Antigravity renders the native IDE **Proceed** button and feedback UI.
- When the user clicks **Proceed**, dispatch persona subagents via `invoke_subagent`:
  1. **`developer` Subagent** ([agents/developer.md](../agents/developer.md)): Dispatched during `IMPLEMENT` in an isolated Git worktree using TDD.
  2. **`quality-engineer` Subagent** ([agents/quality-engineer.md](../agents/quality-engineer.md)): Dispatched during `COLLECT / VERIFY` to run deterministic verification (`python3 scripts/project-verify.py verify`).
  3. **`solution-architect` Subagent** ([agents/solution-architect.md](../agents/solution-architect.md)): Dispatched during `REVIEW` to audit domain purity and Hexagonal layer isolation.
  4. **`security-auditor` Subagent** ([agents/security-auditor.md](../agents/security-auditor.md)): Dispatched during `REVIEW` to audit OWASP security risks and secrets.

---

## 4. Autonomous Self-Correction Rework Loop

During `COLLECT / VERIFY` and `REVIEW`, when a verifier or reviewer persona rejects a slice (`VERIFICATION_FAILED`, `CORRECT_EXECUTE`, `CORRECT_PLAN`, or `SECURITY_VULNERABILITY_FOUND`):
- Increment slice `attempt_count`.
- If `attempt_count <= max_autonomous_retries` (default 3), automatically re-dispatch the `developer` subagent with the exact failure payload. DO NOT stop or request human input during intermediate retries.
- Update the native live progress artifact `walkthrough.md` (`UserFacing: true`) showing retry attempt progress.
- If `attempt_count > max_autonomous_retries`, stop execution, log failure state in `walkthrough.md`, and return decision to the Product Owner.

---

## 5. GitHub Pull Request & Interactive Merge Approval (`UNDER REVIEW` & `DONE`)

Once all DAG slices pass deterministic verification and persona reviews:
- Create GitHub Pull Request (`gh pr create --issue <id>`) linking `Closes #<id>`. Set GitHub Project column to **Review**.
- Submit formal GitHub PR Reviews (`gh pr review <pr-number> --approve` / `--comment`) from each persona (`quality-engineer`, `solution-architect`, `security-auditor`) attaching `walkthrough.md` evidence.
- Present native IDE `ReviewRequest` with `RequestFeedback: true` to the Product Owner linking the GitHub PR and Issue.
- Provide interactive merge prompt instructions:
  > **Delivery Ready for Merge:**
  > - All persona reviews (`quality-engineer`, `solution-architect`, `security-auditor`) passed cleanly.
  > - Click **Proceed** to authorize `gh pr merge` into `main`.
- **Merge Guardrail**: Executors must NEVER merge, approve, or force-push protected default branches (`main`). The Product Owner alone retains merge authority. Upon merge, GitHub auto-closes the issue (`Closes #<id>`) and moves the Project item to **Done**.


