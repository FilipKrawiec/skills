---
name: grill-with-context
description: Use when challenging a proposed change against task-relevant project context, ADRs, glossary, and knowledge sources during provider-neutral SPECIFY/GRILL before planning.
---

# Grill With Context

Challenge proposed changes against active project context and architectural records to produce a verified planning handoff. This skill does not edit implementation code.

## Workflow Phases

### Phase 1: Context Discovery
1. Inspect task-relevant project files, `docs/adr/`, selected technology profiles, Central Knowledge index entries, and Project Knowledge overrides.
2. Record verified facts with their direct file sources.
*Exit Gate*: Verified facts are separated from open user decisions.

### Phase 2: Grilling in Rounds
1. Ask one sharp decision question at a time covering scope boundaries, trade-offs, and edge cases.
2. Output questions in structured round envelopes with recommended answers:
   ```text
   ❓ Q1 - <Question Title>: <Description and trade-offs>
   ➡️ Recommended: <Specific choice and rationale>
   ```
3. Wait for user decision on the active round before advancing the frontier.
*Exit Gate*: All branches of the design tree are resolved.

### Phase 3: Planning Handoff
1. Create or update an ADR only when the outcome is an architectural decision.
2. Emit the compact record for the orchestrator:
   ```text
   Intent: <outcome and non-goals>
   Verified facts: <fact — source path>
   User decisions: <settled choices>
   Open decisions or risks: <only blockers or material follow-up>
   Acceptance and verification: <observable conditions and deterministic gate>
   Relevant knowledge: <profile/entry ids and project overrides>
   Plan context: <scope, dependencies, and constraints for bounded slices>
   ```
*Exit Gate*: Handoff block is emitted and ready for planning.
