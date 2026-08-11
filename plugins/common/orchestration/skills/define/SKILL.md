---
name: define
description: Use when capturing business outcomes, scope boundaries, non-goals, and constraints to define a feature or story idea before delivery orchestration.
---

# Delivery Intent Definition

The **define** skill captures raw ideas, feature proposals, or user needs and transforms them into structured, bounded tracker items on the **Backlog** before launching full delivery orchestration.

## Operational Steps

1. **Capture Intent Details**:
   - Engage with the Product Owner or user to extract five essential dimensions:
     - **Business Outcomes**: Key goals and measurable impact.
     - **In-Scope Boundaries**: Explicit feature capabilities and deliverables.
     - **Non-Goals**: Explicitly excluded features or deferred capabilities.
     - **Technical & Domain Constraints**: Architectural, security, stack, or regulatory boundaries.
     - **Decision Owner**: Single point of authority for trade-offs.

2. **Format Tracker Payload**:
   - Construct a clear GitHub Issue title and structured Markdown body.
   - Assign appropriate type labels: `type:feature`, `type:story`, `type:task`, or `type:bug`.
   - Read [idea-capture.md](references/idea-capture.md) for payload format and issue templates.

3. **Create Tracker Item**:
   - Execute `gh issue create` with `--title`, `--body`, and `--label`.
   - Record the created Issue number and URL.

4. **Initialize Board Status**:
   - Add the issue to the GitHub Project board and set status to **Backlog**.

5. **Handoff to Delivery Lifecycle**:
   - Transition to Stage 2 (**SPECIFY / GRILL**) using `orchestrate-delivery` or `grill-with-docs` to challenge assumptions and refine technical specifications before planning.

---

## Context Pointers

- Read [idea-capture.md](references/idea-capture.md) when structuring complex intent payloads or mapping issue fields.
