# Ubiquitous Language

- Keep one glossary per bounded context in `docs/context.md`.
- Record only stable terms agreed with domain experts; never code paths, tables, payloads or task notes.
- Update the glossary before the code when introducing a business concept, and as soon as an ambiguous or contradictory term is resolved.

```markdown
# Context

## Terms

### <TermName>
A precise definition written in domain language.

- **Also called:** <aliases, or "None">
- **Not to be confused with:** <near-miss terms, or "None">
```
