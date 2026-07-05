---
name: sdlc
description: Must be used for EVERY task that modifies repository files, including documentation, configuration, and skill edits. Steers execution through DEFINE, SPEC, PLAN, EXECUTE, REVIEW, SHIP, IMPROVE phases with YAML record tracking.
user-invocable: false
---

# SDLC Workflow

Execute tasks using the SDLC phases and subphase lifecycles, governed by the single YAML record.

## Playbook Steps

1. **Verify State:**
   - Locate the single SDLC record file at `.sdlc/issues/<issue-id>-<branch-name>-<attempt-doubledigit>.yaml` (if there is no issue ID, determine the next available ID by auto-incrementing based on existing files, starting at `1`). If not present, initialize it using the template at `resources/sdlc-template.yaml` (relative to this skill's directory). Ensure `.sdlc/` is automatically added to `.gitignore`.
   - Read the `current_phase` and `lifecycle_stage` keys to determine the active context.
2. **Execute Active Phase:**
   - Execute the internal lifecycle subphases (Initialization, Configuration, Execution, Verify, Improve) for the active phase.
   - Refer to the detailed phase requirements in [phases.md](references/phases.md).
3. **Verify Deliverables:**
   - Run the deterministic verification command or subagent validation loop.
   - Run the validation script: `python3 scripts/validate-sdlc-record.py .sdlc/issues/<issue-id>-<branch-name>-<attempt-doubledigit>.yaml` (from this skill's directory) to validate the record structure.
4. **Transition Phase:**
   - Update the YAML record state (mark phase status, improvements, set next phase, increment iteration if needed) and save.
   - If in `hil` mode and the next phase is interactive (e.g. SPEC, PLAN), stop and wait for human trigger.
   - **Executive Summary for Approvals:** Whenever the workflow stops to ask the user for approval (specifically at the end of the `PLAN` and `REVIEW` phases in `hil` mode), the agent MUST output a concise executive summary detailing exactly what the user is supposed to approve (e.g. key tasks in the plan, or changes made, diff highlights, and verification results) and present a multiple-choice question (using the `ask_question` tool with options like "Approve and proceed" or "Request changes") so the user can easily select their response.

---

## Context Pointers

- Read [phases.md](references/phases.md) when executing any of the seven SDLC phases.
- Read [state-schema.md](references/state-schema.md) when initializing, updating, or reading the single SDLC record file.
- Read [lifecycles.md](references/lifecycles.md) when executing subphase stages or self-debugging tasks.
- Read [multi-agent-negotiation.md](references/multi-agent-negotiation.md) when executing plan or review validation loops in AFK mode.
- Read [formats.md](references/formats.md) when writing architectural decisions (ADRs) or task briefs (PRDs).
