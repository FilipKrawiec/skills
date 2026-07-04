---
name: sdlc
description: Must be used for every programming task. Steers execution through DEFINE, SPEC, PLAN, EXECUTE, REVIEW, SHIP, IMPROVE phases with YAML record tracking.
user-invocable: false
---

# SDLC Workflow

Execute tasks using the SDLC phases and subphase lifecycles, governed by the single YAML record.

## Playbook Steps

1. **Verify State:**
   - Locate the single SDLC record file at `.sdlc/issues/<ticket-id>-<iteration-index-doubledigit>.yaml`. If not present, initialize it using the template at `resources/sdlc-template.yaml` (relative to this skill's directory).
   - Read the `current_phase` and `lifecycle_stage` keys to determine the active context.
2. **Execute Active Phase:**
   - Execute the internal lifecycle subphases (Initialization, Configuration, Execution, Verify, Improve) for the active phase.
   - Refer to the detailed phase requirements in [phases.md](references/phases.md).
3. **Verify Deliverables:**
   - Run the deterministic verification command or subagent validation loop.
   - Run the validation script: `python3 scripts/validate-sdlc-record.py .sdlc/issues/<ticket-id>-<iteration-index-doubledigit>.yaml` (from this skill's directory) to validate the record structure.
4. **Transition Phase:**
   - Update the YAML record state (mark phase status, improvements, set next phase, increment iteration if needed) and save.
   - If in `hil` mode and the next phase is interactive (e.g. SPEC, PLAN), stop and wait for human trigger.

---

## Context Pointers

- Read [phases.md](references/phases.md) when executing any of the seven SDLC phases.
- Read [state-schema.md](references/state-schema.md) when initializing, updating, or reading the single SDLC record file.
- Read [lifecycles.md](references/lifecycles.md) when executing subphase stages or self-debugging tasks.
- Read [multi-agent-negotiation.md](references/multi-agent-negotiation.md) when executing plan or review validation loops in AFK mode.
- Read [formats.md](references/formats.md) when writing architectural decisions (ADRs) or task briefs (PRDs).
