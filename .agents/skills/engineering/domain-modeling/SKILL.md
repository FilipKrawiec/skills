---
name: domain-modeling
description: Build and sharpen domain language, context boundaries, and ADRs while designing or implementing.
---

# Domain Modeling

Use this when changing the model, not merely reading it. Challenge fuzzy language, test concrete scenarios, and write down terms or decisions when they crystallize.

## Files

- `CONTEXT.md` is the glossary. Create it lazily when the first stable term is resolved.
- `docs/adr/` holds architectural decisions. Create it lazily when the first ADR is needed.
- If `CONTEXT-MAP.md` exists, use it to find the right bounded context before editing glossary or ADR files.

## Session Rules

- Challenge overloaded terms against `CONTEXT.md`.
- Propose a canonical term when the user says something vague.
- Stress-test relationships with concrete edge cases.
- Cross-check claims against code when a codebase exists.
- Update `CONTEXT.md` inline when a term is resolved; use `references/CONTEXT-FORMAT.md`.

## ADR Gate

Offer an ADR only when all three are true:

1. The decision is costly to reverse.
2. A future reader would wonder why this path was chosen.
3. The decision chose between real alternatives.

If the gate passes, use `references/ADR-FORMAT.md`. If it fails, keep the note in the conversation or glossary instead.
