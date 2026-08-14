---
name: define
description: Use when capturing business outcomes, scope boundaries, non-goals, and constraints to create a GitHub Issue on the Backlog before delivery orchestration (Issue-creation only; does not write code or implementation plans).
disable-model-invocation: true
---

# Delivery Intent Definition

The **define** skill captures raw ideas, feature proposals, or user needs and transforms them into structured, bounded tracker items on the **Backlog** before launching full delivery orchestration.

> [!IMPORTANT]
> **Execution Boundary Directive**: The `define` skill is strictly an intent capture and tracker item creation workflow (`gh issue create`). It supersedes host implementation planning mode. When `define` or `/define` is invoked, you MUST NOT draft `implementation_plan.md`, generate technical code DAGs, or modify source code files.

## Operational Steps

1. **Capture Intent Details**:
   - Engage with the Product Owner or user to extract five essential dimensions quickly without intrusive grilling:
     - **Business Outcomes**: Key goals and measurable impact.
     - **In-Scope Boundaries**: Explicit feature capabilities and deliverables.
     - **Non-Goals**: Explicitly excluded features or deferred capabilities.
     - **Technical & Domain Constraints**: Architectural, security, stack, or regulatory boundaries.
     - **Decision Owner**: Single point of authority for trade-offs.

2. **Duplicate Prevention Check**:
   - Run `gh issue list --search "<keywords>"` to inspect existing open and closed issues for similar features.
   - If an existing issue matches the intent, present the existing issue URL to the Product Owner and ask if they prefer to update it instead of creating a duplicate.

3. **Format Tracker Payload**:
   - Construct a clear GitHub Issue title and structured Markdown body.
   - Assign appropriate type labels: `type:feature`, `type:story`, `type:task`, or `type:bug`.
   - Read [idea-capture.md](references/idea-capture.md) for payload format and issue templates.

4. **Create Tracker Item**:
   - Execute `gh issue create` with `--title`, `--body`, and `--label`.
   - Record the created Issue number and URL.

5. **Initialize Board Status**:
   - Add the issue to the GitHub Project board (`gh project item-add ... --format json`) and immediately assign its status to **`01 Define`** (or `Backlog`) using `gh project item-edit`.

6. **Completion Boundary Guardrail**:
   - The `define` skill MUST finish by creating the tracker item (`gh issue create`), assigning its project board phase to **`01 Define`** (or `Backlog`), and presenting the Issue link to the user.
   - It MUST NOT proceed directly to code execution or drafting `implementation_plan.md`; the created GitHub Issue is the required output so the Product Owner can refine and specify the idea in Stage 2 (**SPECIFY / GRILL**).

---

## Context Pointers

- Read [idea-capture.md](references/idea-capture.md) when structuring complex intent payloads or mapping issue fields.
