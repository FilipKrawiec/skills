# Ubiquitous Language Glossary Format

Constraints for documenting the Ubiquitous Language in a project's `CONTEXT.md` file, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Rules for the Glossary (`CONTEXT.md`)
- **Single Source of Truth:** Keep a single shared glossary in the root of the Bounded Context/project repository.
- **Stable Terms Only:** Document only stable, domain-meaningful terms defined collaboratively with domain experts.
- **Zero Technical Details:** Never include implementation structures, code file paths, database tables, JSON payloads, or transient task notes.

## 2. Formatting Structure

Use the following layout for `CONTEXT.md`:

```markdown
# Context

## Terms

### <TermName>
A precise definition written in domain language.

- **Also called:** <Any domain-meaningful aliases, or "None">
- **Not to be confused with:** <Near-miss terms, or "None">
```

## 3. Behavioral Guidelines for the Agent
- If you encounter a new domain term during execution, ensure it matches a term in `CONTEXT.md`.
- If you are asked to introduce a new business concept, first update `CONTEXT.md` before changing code.
