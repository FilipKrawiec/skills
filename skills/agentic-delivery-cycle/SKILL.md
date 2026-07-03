---
name: agentic-delivery-cycle
description: Use when steering the agent through the 7 phases of the Agentic Delivery Cycle and applying the 4D framework. Trigger at the start of a task, when shifting between phases, or when writing specs, plans, and retrospectives.
---

# Agentic Delivery Cycle & 4D Framework

Follow this playbook to execute tasks using the 7 phases of the delivery cycle, governed by the 4D framework.

## The 4D Principles

- **Description:** Clearly define tasks, constraints, success criteria, and non-goals.
- **Delegation:** Break tasks down so subagents have precise boundaries and instructions.
- **Discernment:** Challenge code layout, dependency boundaries, and implementation patterns.
- **Diligence:** Validate code execution, ensure test coverage, and verify against spec definitions.

---

## Phases

### 01 DEFINE
- **Inputs:** Original user request.
- **Steps:** Rewrite the request in plain language, expose assumptions, and identify constraints.
- **Outputs:** Task Brief.
- **Improve:** Suggest ways to define tasks better (via chat transcript if interactive; append to `docs/records/YYYY-MM-DD-improvement.md` if autonomous).

### 02 SPEC
- **Inputs:** Task Brief.
- **Steps:**
  - Refine the technical specification and define design boundaries.
  - **Use the `grill-with-docs` skill** to stress-test the specification and resolve open design questions before finalizing.
- **Outputs:** Refined Technical Spec / Issue.
- **Improve:** Suggest ways to specify tasks better (via chat or record).

### 03 PLAN
- **Inputs:** Refined Technical Spec / Issue.
- **Steps:** Inspect the codebase, map changes, and write implementation/test plans. Wait for developer approval.
- **Outputs:** Approved Plan.
- **Improve:** Suggest ways to plan better (via chat or record).

### 04 EXECUTE
- **Inputs:** Approved Plan.
- **Steps:** Write tests and code in small vertical slices (refer to `tdd`, `domain-driven-design`, and `hexagonal-architecture` skills).
- **Outputs:** Verified implementation.
- **Improve:** Suggest ways to execute better (via chat or record).

### 05 REVIEW
- **Inputs:** Verified implementation.
- **Steps:** Review changes against spec definitions, verify code layout, and seek human feedback.
- **Outputs:** Review Notes.
- **Improve:** Suggest ways to review better (via chat or record).

### 06 SHIP
- **Inputs:** Approved changes.
- **Steps:** Merge code, verify build pipeline, and ensure deployment validation.
- **Outputs:** Shipped code.
- **Improve:** Suggest ways to ship better (via chat or record).

### 07 IMPROVE
- **Inputs:** Accumulated phase improvements.
- **Steps:** Consolidate lessons learned. Suggest overall workflow updates in the chat if interactive; write them to `docs/records/YYYY-MM-DD-improvement.md` if autonomous.

## Context Pointers

- Read [ADR-FORMAT.md](references/ADR-FORMAT.md) when recording architectural decisions during the definition, specification, or planning phases.
