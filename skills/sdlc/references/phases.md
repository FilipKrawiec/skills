# SDLC Phase Reference

This document outlines the detailed requirements, actions, and validation criteria for each of the seven SDLC phases.

---

## DEFINE

*   **Initialization:** 
    - Retrieve the task requirements from the original issue (e.g., `docs/issues/<ticket_id>.md`).
    - Detect if the `afk` label is present to set the execution `mode`.
    - Initialize the single SDLC record file at `.sdlc/issues/<ticket-id>-<iteration-index-doubledigit>.yaml` by copying `resources/sdlc-template.yaml` (relative to this skill's directory) and populating the ticket details.
*   **Configuration:** Plan the execution boundaries and scope for this phase.
*   **Execution:** 
    - Clarify requirements via intent-focused questions.
    - Check if new domain terms must be established in the glossary (`CONTEXT.md`) following the `` `domain-driven-design` `` skill.
    - Write the Task Brief structure directly in the `brief` section of the SDLC record.
*   **Verify:** Ensure that the brief section exists and complies with the schema defined in [state-schema.md](state-schema.md) and [formats.md](formats.md).
*   **Improve:** Append lessons learned under the DEFINE phase `improvements` section. Mark status `COMPLETED`, set `current_phase` to `SPEC`, and reset `lifecycle_stage` to `INITIALIZATION`. Halt execution if `mode` is `hil`.

---

## SPEC

*   **Initialization:** Verify that the `brief` section is marked verified.
*   **Configuration:** Identify architectural boundaries and target components.
*   **Execution:**
    - **MANDATORY:** Conduct a grilling session using the `` `grill-with-docs` `` skill to stress-test the specification and resolve open assumptions.
    - Ensure new domain terms or bounded context mappings are updated in `CONTEXT.md` and `CONTEXT-MAP.md` following the `` `domain-driven-design` `` skill.
    - Write the final specification section in the SDLC record (acts as the draft/RFC during the grilling session).
*   **Verify:** Verify that the specification section in the SDLC record is fully populated and all grilled questions are marked resolved.
*   **Improve:** Append lessons learned. Mark status `COMPLETED`, set `current_phase` to `PLAN`, reset `lifecycle_stage` to `INITIALIZATION`. Halt execution if `mode` is `hil`.

---

## PLAN

*   **Initialization:** Verify that the specification section exists and is verified.
*   **Configuration:** Scan the codebase to identify files, classes, and test locations.
*   **Execution:** 
    - Design the implementation plan inside the SDLC record.
    - **Structure:** Break the plan into sequential **execution steps**.
    - **Threads:** Each execution step consists of one or more **threads**.
    - **Parallelism:** Indicate parallelizable threads (exercise caution with non-thread-safe tools like `gradlew`).
    - **Lifecycles:** Map tasks to the subphase lifecycles (Initialization, Configuration, Execution, Verify, Improve). Coordinate tasks to verify at the end of each thread, looping back on failures.
    - **Skills:** Explicitly specify the skills (e.g., `` `tdd` ``, `` `domain-driven-design` ``, `` `hexagonal-architecture` ``) required for each task.
*   **Verify:**
    - *AFK Mode:* Spawn a reviewer subagent to check the plan against the brief and spec. The reviewer must approve with a YAML response `result: APPROVED`. For negotiation, mediator resolution, and auto-approval limits, read [multi-agent-negotiation.md](multi-agent-negotiation.md).
    - *HiL Mode:* Human approves by setting `approved: true` in the YAML record.
*   **Improve:** Append lessons learned. Mark status `COMPLETED`, set `current_phase` to `EXECUTE`, reset `lifecycle_stage` to `INITIALIZATION`.

---

## EXECUTE

*   **Initialization:** Verify the plan is approved (`approved: true`).
*   **Configuration:** Maintain a clean root agent context. Do NOT load extensive code or test locations into the root agent. Subagents must own task scope and execution details.
*   **Execution:** Implement code and tests in small vertical slices using `` `tdd` ``, `` `hexagonal-architecture` ``, and `` `domain-driven-design` `` skills—ideally spawning subagents to control bias.
*   **Verify:** Run the deterministic `verify_command` defined for each step in the plan. Compiler errors, lint failures, or test regressions must block completion.
*   **Improve:** Append lessons learned. Mark status `COMPLETED`, set `current_phase` to `REVIEW`, reset `lifecycle_stage` to `INITIALIZATION`.

---

## REVIEW

*   **Initialization:** Verify implementation is complete and passes all tests.
*   **Configuration:** Generate the git diff of the implementation.
*   **Execution:** Write the review details directly in the SDLC record.
*   **Verify:**
    - *AFK Mode:* Spawn a reviewer subagent (`Senior Software Architect & QA Auditor`) to review the implementation diff. The reviewer must reply with `result: APPROVED`. For rollback and iteration protocols on stalemate, read [multi-agent-negotiation.md](multi-agent-negotiation.md).
    - *HiL Mode:* Human reviews the diff. If approved, the human sets `approved: true`. If rejected, transition back to `PLAN` with the human's feedback.
*   **Improve:** Append lessons learned. Mark status `COMPLETED`, set `current_phase` to `SHIP`, reset `lifecycle_stage` to `INITIALIZATION`.

---

## SHIP

*   **Initialization:** Verify review approval, Merge/Pull Request approval, and green CI status.
*   **Configuration:** Identify the target branch and merge settings.
*   **Execution:** Consult the repository deployment runbook (e.g. `docs/runbooks/deploy.md`). Merge code (prefer a single squashed commit on trunk), deploy to staging/pre-production, and promote to production.
*   **Verify:** Run post-deployment verification checks. If they fail, roll back the deployment and return to the `REVIEW` phase with a new Merge Request.
*   **Improve:** Append lessons learned. Mark status `COMPLETED`, set `current_phase` to `IMPROVE`, reset `lifecycle_stage` to `INITIALIZATION`.

---

## IMPROVE

*   **Initialization:** Verify the workflow has completed (successfully shipped or concluded).
*   **Configuration:** Gather all improvements accumulated across phases.
*   **Execution:** Consolidate lessons and write the final retrospective directly to the SDLC record.
*   **Verify:** Create new issues/tickets for any actionable improvements identified.
*   **Improve:** Conclude the task and set the ticket state to completed.
