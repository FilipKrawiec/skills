---
name: writing-great-skill
description: Use when creating, modifying, editing, or validating skills, agent rules (AGENTS.md), or plugin manifests in this repository.
allowed-tools: Skill Read Edit Bash(python3:*,just:*)
---

# Writing Great Skill

A skill should make agent behavior more predictable. Bold terms are defined in `references/glossary.md`.

## Invocation & Cross-Skill Calling

- **Frontmatter Tool Allowance (`allowed-tools`)**: Every skill MUST declare its permitted tool capabilities as a space-delimited string in YAML frontmatter (e.g. `allowed-tools: Skill Read Edit Bash(git:*)`). Declare `Skill` when the workflow invokes downstream skills.
- **Model Invocation**: Use when the agent must discover the skill autonomously.
- **User Invocation**: Use when the human triggers the workflow explicitly. Set `disable-model-invocation: true` in YAML frontmatter and keep the description as a terse human-facing label.
- **Router Skill**: Provide a dedicated router skill (`guide`) to help users and models select the optimal workflow path.
- **Dual Invocation Modes**:
  - **Inline Chaining**: Caller borrows domain rules directly into the active turn context (e.g. `tdd` invoking `ddd` or `hexagonal-architecture`). Phrase as: "When designing domain models, invoke `ddd`."
  - **Delegated Subagent Invocation**: Orchestrator dispatches an isolated subagent with a dedicated task packet and active skill bundle (e.g. `deliver` dispatching `developer`).
- **Composition Invariants**:
  - **Strict DAG (No Recursion)**: Skill dependency graphs must form a Directed Acyclic Graph with max depth <= 2. Never call skills cyclically.
  - **Deterministic Exit Gates**: Every callee skill must produce a verified exit gate before yielding control back to the caller.

## Description Craft

A model-invoked **description** is always in startup context. It must earn that cost.

- Start with "Use when..." and describe user intent, not implementation.
- Include distinct trigger branches; collapse synonyms.
- Keep the boundary clear enough to avoid near-miss false triggers.
- Stay under 1024 characters.

For user-invoked skills (`disable-model-invocation: true`), keep the description as a one-line human summary.

## Instruction Wording & Affirmative State Machines

Structure skills as **unidirectional affirmative state machines**:
- Divide workflows into sequential numbered phases.
- State only the single desired affirmative action in each phase. Omit negative phrasing ("Don't do X", "Never do Y") to prevent negative prompt priming.
- Pair each phase with a concrete **Exit Gate** (test output, command exit code 0, or file diff).

## Explicit Output Envelopes

Output tokens are significantly more expensive and slower than input tokens. Define an **Explicit Output Envelope** (compact Markdown template) for each phase or turn to eliminate unsolicited narrative essays and token bloat.

## Diagramming Standard

Use clean standard ASCII / Unicode box-drawing diagrams and structured Markdown tables. Do not use Mermaid code blocks (unreliable rendering across terminal pagers and editor viewers).

## Code Anti-Overengineering Invariants

- **Rule of Two Adapters**: Never create an interface or abstraction layer unless at least two concrete implementations exist in the active codebase.
- **YAGNI & Deep Modules**: Favor deep modules with small interfaces over shallow file proliferation. Pass domain types directly rather than creating speculative DTO chains.

## Information Hierarchy

- Put required **steps** in `SKILL.md`.
- Move branch-specific reference behind a clear **context pointer**: "Read X when Y."
  - **Path Rule (Local)**: `X` must be a relative link targeting a file inside the skill's own local `references/` directory (e.g., `[glossary.md](references/glossary.md)` or `[subtopic.md](references/category/subtopic.md)`).
  - **Path Rule (Shared Package Authority)**: Skills shipped together in one plugin MAY use a relative link to one package-local authority outside their own directory (e.g., `[shared.md](../../references/shared.md)` from a skill directory). Verify that link from the installed package; do not copy the authority per skill.
  - **Rule**: Never use absolute local file URLs (e.g., `file:///...`) or reference files outside the installed plugin. Reference other skills textually using backticks (e.g., `` `other-skill` ``) unless using the shared-authority exception.
- **Reference Scope & Sizing**:
  - Keep each reference file focused on a single topic, domain model, language profile, or specification.
  - Prioritize scannable reference formats: tables, checklists, and minimal self-contained code examples. Keep reference files under 300 lines (~1,500 tokens).
  - Do not include a Table of Contents (TOC) or section anchor list in reference files; agents parse markdown headings directly, and TOCs duplicate text without changing behavior.
  - Do not duplicate procedural steps or execution workflows from `SKILL.md` in reference files.
- **Lazy Loading Guardrail**:
  - Write explicit, disjoint trigger conditions for context pointers to prevent eager pre-fetching.
  - Load only the specific reference required for the active branch; do not preload the entire `references/` directory.
- **Cross-Reference Hygiene**:
  - Reference files may link to sibling reference files via relative paths. Keep reference graphs flat and avoid circular reference chains.
- Keep each meaning in one source of truth.
- Evaluate instruction cost, shared-contract dependency cost, and observed run cost separately; static contract size alone is not a skill-quality failure.

## Naming Conventions

- **Skill Directory**: Must use `lowercase-kebab-case` (e.g., `ddd`).
- **Main Instruction File**: Must be named exactly `SKILL.md` (all uppercase).
- **Reference Files**: Must use `lowercase-kebab-case.md` (e.g., `ubiquitous-language.md`), and reside within a local `references/` subdirectory (or nested subdirectories like `references/languages/`) or the verified shared package authority.
- **Assets**: Store templates and static resources in `assets/`.
- **Scripts**: Store executable helper code in `scripts/`; scripts must be non-interactive and document usage.

## Pruning

Delete lines that are generic, duplicated, stale, or do not change behavior. When a skill feels long, first look for reference that can move down the hierarchy, then look for branches that should split.

---

## Context Pointers

- Read [glossary.md](references/glossary.md) when looking up definitions of bold terms.
- Read [agentskills-guide.md](references/agentskills-guide.md) when designing, optimizing, testing, or specification-validating a skill or custom script.
