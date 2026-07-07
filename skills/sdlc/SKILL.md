---
name: sdlc
description: "Use when modifying repository files through a bounded agentic development harness: define the task, select guides, run work in a sandbox, execute deterministic sensors, feed failures back for limited correction, run review, request human approval, and record the event trail."
---

# SDLC Harness

Run repository changes through a bounded harness: guides steer work, sensors inspect output, humans approve irreversible effects, and the YAML record keeps the event trail.

## Core Loop

1. **State:** Locate or create `.sdlc/issues/<issue-id>-<branch-name>-<attempt-doubledigit>.yaml` from `assets/sdlc-template.yaml`; read `current_phase` and `lifecycle_stage`.
2. **Configure:** Select guides, sensors, sandbox policy, approval gates, and context boundaries before acting.
3. **Execute:** Read only the active phase reference and perform that phase. Patch production happens only in EXECUTE.
4. **Verify:** Run deterministic sensors before inferential review; record results, retries, risks, and events.
5. **Improve:** Update phase status, lessons, event log, and next phase. In `hil` mode, present the approval gate summary before asking for approval, then stop.

From the repository root, validate the active record with `python3 skills/sdlc/scripts/validate-sdlc-record.py .sdlc/issues/<issue-id>-<branch-name>-<attempt-doubledigit>.yaml`.

## Approval Gates

Before every human approval request, show an **Execution Summary** in the visible response. Ask for approval only after the summary.

The summary must include:

- Current phase outcome: what was decided, planned, changed, reviewed, or shipped.
- Affected files or components.
- Verification status: sensors run, pass/fail results, and skipped checks.
- Risks, open questions, retry history, or reviewer findings.
- Next step that approval permits.

If using a structured approval tool, place the Execution Summary in the message immediately before the tool call and keep the tool prompt self-contained enough to make the decision clear.

---

## Context Pointers

- Read [phase-define.md](references/phase-define.md) when `current_phase` is `DEFINE`.
- Read [phase-spec.md](references/phase-spec.md) when `current_phase` is `SPEC`.
- Read [phase-plan.md](references/phase-plan.md) when `current_phase` is `PLAN`.
- Read [phase-execute.md](references/phase-execute.md) when `current_phase` is `EXECUTE`.
- Read [phase-review.md](references/phase-review.md) when `current_phase` is `REVIEW`.
- Read [phase-ship.md](references/phase-ship.md) when `current_phase` is `SHIP`.
- Read [phase-improve.md](references/phase-improve.md) when `current_phase` is `IMPROVE`.
- Read [state-schema.md](references/state-schema.md) when initializing, updating, or reading the single SDLC record file.
- Read [multi-agent-negotiation.md](references/multi-agent-negotiation.md) when executing separated reviews, handling exhausted correction attempts, resolving HIL rejections, or escalating blocked work.
- Read [formats.md](references/formats.md) when writing architectural decisions (ADRs) or task briefs (PRDs).
