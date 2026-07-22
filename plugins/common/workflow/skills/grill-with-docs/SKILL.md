---
name: grill-with-docs
description: Use when stress-testing a plan, design, PRD, or ADR against source docs to challenge assumptions, contradictions, missing decisions, and unresolved questions.
---

# Grill With Docs

Run a grilling session against the supplied docs. If the session settles domain language or an architectural decision, use `ddd` to update `CONTEXT.md` or ADRs.

## Loop

1. Read the source docs and inspect the environment to resolve verifiable facts. Identify only the user decisions that remain.
2. Ask one sharp decision question at a time; wait for the answer before moving on.
3. Challenge contradictions against the docs immediately.
4. When a decision crystallizes, record the doc update before continuing.

Stop when the plan has no unresolved contradictions, missing decisions, or undefined domain terms that would block implementation. Before turning the session into an implementation plan or code change, ask the user to confirm the shared understanding.
