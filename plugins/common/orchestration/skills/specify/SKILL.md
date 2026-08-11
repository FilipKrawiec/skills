---
name: specify
description: Use when refining, grilling, and detailing a Backlog GitHub Issue before delivery execution.
---

# Backlog Item Specification & Grilling

The **specify** skill takes an existing GitHub Issue on the **Backlog** and conducts interactive grilling sessions (`grill-with-docs`) to refine its scope, clarify edge cases, validate acceptance criteria against repository context, and update the tracker item.

> [!IMPORTANT]
> **Execution Boundary Directive**: The `specify` skill updates tracker specifications (`gh issue edit`, `gh issue comment`). It supersedes host implementation planning mode. When `specify` or `/specify` is invoked, do NOT draft `implementation_plan.md`, generate technical code DAGs, or modify source code files.

## Operational Steps

1. **Select Target Backlog Item**:
   - Fetch target issue details (`gh issue view <id>`).
   - Parse existing business outcomes, scope, non-goals, and constraints.

2. **Conduct Interactive Grilling Session**:
   - Read `grill-with-docs` to challenge the specification against repository code, Central Knowledge items, and Project Knowledge overrides.
   - Ask progressive, one-at-a-time decision questions to resolve:
     - Architectural trade-offs and layer boundaries (Hexagonal / DDD).
     - Concrete acceptance criteria and edge cases.
     - Testing requirements (TDD contracts).

3. **Update Tracker Specification**:
   - Update issue description using `gh issue edit <id> --body-file <refined-file>`.
   - Post summary comment (`gh issue comment <id>`) detailing resolved decisions and acceptance criteria.

4. **Completion Boundary Guardrail**:
   - The `specify` skill MUST finish by updating the GitHub Issue on the **Backlog** (or setting status to **Blocked** if unresolved blockers remain).
   - It MUST NOT proceed to drafting technical `implementation_plan.md` or executing code changes. `orchestrate-delivery` owns stage 3+ execution when the item is ready.

---

## Context Pointers

- Read `grill-with-docs` when conducting source-backed specification challenges.
- Read [github-pipeline-integration.md](../orchestrate-delivery/references/github-pipeline-integration.md) when executing `gh issue` updates.
