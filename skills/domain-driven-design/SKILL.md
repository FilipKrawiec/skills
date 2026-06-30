---
name: domain-driven-design
description: Use when defining ubiquitous language, bounded contexts, and strategic designs. Trigger when updating CONTEXT.md, designing domain models, defining naming conventions, or managing bounded context boundaries.
---

# Domain-Driven Design (DDD) - Strategic

Follow these steps to establish strategic alignment, define ubiquitous language, and name core domain concepts.

## Steps

1. **Establish Ubiquitous Language:**
   - Review or update `CONTEXT.md` (glossary) using `references/CONTEXT-FORMAT.md` when new business concepts or terms are defined.
   - Challenge vague, overloaded, or technical jargon in business discussions to establish canonical terms.
2. **Define Bounded Contexts:**
   - Check `CONTEXT-MAP.md` if it exists to locate the correct context boundaries.
   - Ensure each concept has a single source of meaning within its bounded context.
3. **Define Invariants and Naming:**
   - Model aggregates to protect business invariants.
   - Use clean naming conventions aligned with the business domain.
   - Avoid leaking infrastructure details (like database structures or protocols) into domain entity naming.

## Context Pointers

- Read `references/CONTEXT-FORMAT.md` when updating `CONTEXT.md`.
- Read `references/ADR-FORMAT.md` when creating or modifying ADRs.
- Read `skills/hexagonal-architecture/SKILL.md` when implementing the code layers for these domain models.
