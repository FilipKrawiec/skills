# ADR Format

ADRs live in `docs/adr/` and use sequential numbering:

`0001-short-slug.md`

Keep ADRs short. The value is recording that a decision was made and why.

```markdown
# ADR-0001: <Decision>

## Decision

<The choice that was made.>

## Context

<The forces, constraints, or alternatives that made the decision non-obvious.>

## Consequences

<The tradeoffs this creates.>
```

Optional frontmatter can be added only when status matters:

```yaml
---
status: accepted
---
```
