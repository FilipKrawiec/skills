# SDLC Deliverable Formats

This document defines writing conventions for SDLC deliverables. Schema fields live in `state-schema.md`; ready-to-use templates live in `assets/`.

---

## PRD / Task Brief Format

The PRD is modeled as the `brief` section inside the single-record SDLC YAML file under the DEFINE phase. Use `assets/prd-template.yaml` for the minimal brief shape and `state-schema.md` for the complete record schema.

### Guidelines

1. **Ubiquitous Language:** Enforce the domain terms defined in `CONTEXT.md` throughout the brief.
2. **Measurable Acceptance Criteria:** Every acceptance criterion must be verifiable (either via automated tests or clear manual steps).
3. **Strict Constraints:** List all platform, framework, and security boundaries. Do not write generic best practices—only write constraints specific to this task.
4. **Scope Creep Prevention:** Use the `non_goals` section to explicitly exclude features or modifications that are not part of the initial slice.

---

## Harness Controls

Harness controls are modeled in the top-level `harness` section and refined in SPEC and PLAN. Use `state-schema.md` as the source of truth for the YAML shape.

Guides steer the agent before work begins. Sensors inspect outputs after work begins. Prefer computational sensors as the first quality gate, and use inferential sensors for review-risk detection after deterministic checks pass.

---

## ADR Format

ADRs live in `docs/adr/` and use sequential numbering: `000X-short-slug.md` (e.g. `docs/adr/0002-hexagonal-architecture.md`). A template is available at `skills/sdlc/assets/adr-template.md`.

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
