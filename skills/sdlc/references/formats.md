# SDLC Deliverable Formats

This document defines the structures and formatting rules for core SDLC deliverables: the Product Requirement Document (PRD) / Task Brief and the Architectural Decision Record (ADR).

---

## PRD / Task Brief Format

The PRD is modeled as the `brief` section inside the single-record SDLC YAML file under the `DEFINE` phase. A ready-to-use template is located at `skills/sdlc/resources/prd-template.yaml`.

### Schema

```yaml
brief:
  summary: "<A clear, concise 1-2 sentence description of the goal.>"
  context: "<The business rationale, problem being solved, and background info.>"
  constraints:
    - "<Technical constraint (e.g. Kotlin 1.9, no external dependencies)>"
    - "<Architectural constraint (e.g. domain layer must be framework-free)>"
  acceptance_criteria:
    - "<Measurable goal 1 (e.g. 100% branch test coverage)>"
    - "<Measurable goal 2 (e.g. returns HTTP 400 on negative values)>"
  non_goals:
    - "<Out of scope item (explicitly defined to prevent scope creep)>"
```

### Guidelines

1. **Ubiquitous Language:** Enforce the domain terms defined in `CONTEXT.md` throughout the brief.
2. **Measurable Acceptance Criteria:** Every acceptance criterion must be verifiable (either via automated tests or clear manual steps).
3. **Strict Constraints:** List all platform, framework, and security boundaries. Do not write generic best practices—only write constraints specific to this task.
4. **Scope Creep Prevention:** Use the `non_goals` section to explicitly exclude features or modifications that are not part of the initial slice.

---

## ADR Format

ADRs live in `docs/adr/` and use sequential numbering: `000X-short-slug.md` (e.g. `docs/adr/0002-hexagonal-architecture.md`). A template is available at `skills/sdlc/resources/adr-template.md`.

Keep ADRs short. The value is recording that a decision was made, the context behind it, and the consequences.

### Template

```markdown
# ADR-000X: <Decision/Title>

## Decision

<The choice that was made.>

## Context

<The forces, constraints, or alternatives that made the decision non-obvious.>

## Consequences

<The tradeoffs this creates.>
```

### Metadata Frontmatter (Optional)

Optional YAML frontmatter can be added to track state:

```yaml
---
status: accepted # or proposed, deprecated, superseded
---
```
