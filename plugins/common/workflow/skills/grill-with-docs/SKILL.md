---
name: grill-with-docs
description: Use when challenging a proposed change against task-relevant project and knowledge sources during provider-neutral SPECIFY/GRILL before planning.
---

# Grill With Docs

Use this skill during SPECIFY / GRILL. It turns task-relevant evidence into a concise planning handoff; it does not edit implementation code, create a task lifecycle, or require an ADR.

## Discovery

1. Start with the user's definition and a short inventory: relevant project code, docs, ADRs, glossary, selected technology profiles, Project Knowledge overrides, Central Knowledge index entries, and explicitly referenced sources.
2. Load only sources that bear on the proposed change. Use generated knowledge indexes and profile selection for discovery; do not load an entire knowledge corpus or infer semantic matches.
3. Separate verified facts (with source) from user decisions, assumptions, and unknowns.

## Grill

1. Challenge contradictions, missing decisions, hidden assumptions, risks, scope boundaries, and acceptance or verification gaps against the loaded sources.
2. Ask one sharp decision question at a time only when an answer is genuinely needed; wait before continuing.
3. Treat Project Knowledge as sparse overrides of matching Central Knowledge entries. Report missing or conflicting evidence rather than silently choosing a policy.
4. Use `swot` to structure evidence when evaluating legacy components, system health, or strategic trade-offs.
5. Stop when remaining uncertainty would not block a bounded plan, or return the unresolved material decision to the user.

## Planning handoff

Produce a compact record for the orchestrator:

```text
Intent: <outcome and non-goals>
Verified facts: <fact — source>
User decisions: <settled choices>
Open decisions or risks: <only blockers or material follow-up>
Acceptance and verification: <observable conditions and gate>
Relevant knowledge: <profile/entry ids and project overrides>
Plan context: <scope, dependencies, and constraints for bounded slices>
```

Create or update an ADR only when the outcome is an architectural decision and the project's conventions call for one. Otherwise keep the handoff with the specification/plan evidence.
