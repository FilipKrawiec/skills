# SDLC subphase Lifecycles

Each phase in the SDLC workflow (DEFINE, SPEC, PLAN, EXECUTE, REVIEW, SHIP, IMPROVE) is composed of 5 internal subphase lifecycles.

---

## The 5 Lifecycle Stages

### 1. Initialization
- **Purpose:** Collect inputs, prepare environments, and verify prerequisites.
- **Key Actions:**
  - Check that the previous phase is marked `COMPLETED` in the SDLC record.
  - Read/parse state information (such as active ticket ID, iteration index, and mode).
  - Setup local config/variables.

### 2. Configuration
- **Purpose:** Define scope, boundaries, and variables before doing actual work.
- **Key Actions:**
  - Map target file paths or files to scan.
  - For the **PLAN** or **EXECUTE** phases, determine context boundaries to keep the root agent's context clean.

### 3. Execution
- **Purpose:** Perform the primary task of the phase.
- **Key Actions:**
  - Refer to the detailed execution guidelines for the active phase in [phases.md](phases.md).


---

## 4. The Verification & Quality Harness

Verification is the core quality gate. In both AFK and HIL modes, the agent must adhere to strict verification structures.

### A. Cognitive Separation (Implementer vs. Reviewer)
To prevent cognitive bias, the agent must enforce structural separation during review cycles:
- **Independent Context:** The main agent must spawn a separate, dedicated reviewer subagent (role: `Senior Software Architect & QA Auditor`) to review code or plans.
- **Diff-Based Review:** The reviewer subagent must evaluate the implementation solely from the git diff, target specifications, and the brief, rather than inheriting the implementer's conversational history or internal thinking processes.
- **Blind Verification:** The reviewer should not have access to the implementer's draft explanations; it must judge the code based purely on readability, architecture compliance, test coverage, and functionality.

### B. Deterministic Quality Gates
- **Static Analysis & Linting:** The `verify_command` must verify functional correctness (tests) AND static code analysis/linters.
- **Blockers:** Compiler warnings, style/linting errors, and architectural boundary violations (e.g., domain leaking into infrastructure) must be treated as execution failures.

### C. Inner Execution Loop (Self-Debugging Protocol)
During the **EXECUTE** phase, if a task's `verify_command` fails, the agent must run the Inner Self-Correction Loop:
1. **Error Isolation:** Analyze compiler errors or test failures to identify the exact line of code and cause.
2. **Boundary Check:** Verify if the failure is due to an architectural mismatch (e.g. database schema change, missing port mapping, or mock leakage).
3. **TDD Correction:** Apply minimal fixes using TDD cycles (Failing test -> Green code -> Refactor).
4. **Correction Limit:** The agent is allowed **3 self-debugging attempts** per task. If the tests do not pass after the 3rd attempt, the task is marked `FAILED` and execution halts to trigger the outer plan rollback-and-replanning cycle (see `multi-agent-negotiation.md`).

---

## 5. Improve
- **Purpose:** Retrospective loop and state transition.
- **Key Actions:**
  - Append any lessons learned to the phase's `improvements` section in the YAML record.
  - Set the phase's `status` to `COMPLETED` in the record.
  - Advance `current_phase` to the next phase, reset `lifecycle_stage` to `INITIALIZATION`, and write changes to disk.
  - If in `hil` mode and transitioning to an interactive gate (like SPEC or PLAN), stop and wait for human trigger. When requesting this approval, the agent MUST present a concise executive summary of the details to approve and use the `ask_question` tool so the human can easily select a response.
