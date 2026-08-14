# Glossary

## Predictability

The agent follows the same process for the same class of task.

## Model Invocation

The skill keeps a description visible to the agent so it can be selected automatically. This spends context load.

## User Invocation

The skill is chosen explicitly by the human. This spends human memory instead of context load.

## Description

The always-loaded trigger text for a model-invoked skill.

## Context Pointer

A relative markdown link paired with an explicit, conditional trigger instructing the agent when to load auxiliary reference material on-demand.

## Information Hierarchy

The ordering of material by immediacy: required workflow steps, in-file essential reference, conditionally disclosed reference files.

## Branch

A distinct operational path or mode in which a skill can be executed.

## Single Source Of Truth

Each behavior, rule, or architectural concept has one authoritative home.

## Shared Package Authority

A single authoritative reference document stored at the plugin package level and shared by sibling skills within that package to prevent duplication across skills.

## Lazy Loading (Progressive Disclosure)

The architectural practice of loading reference materials only when the active execution branch requires them, preserving the agent's context window.

## Greedy Pre-fetching

A failure mode where an agent eagerly loads every listed reference file upon skill startup regardless of relevance, exhausting the context token budget.

## No-Op

An instruction that does not change agent behavior.

## Negation

A failure mode in which a prohibition makes the unwanted behavior more prominent in the agent's context. Prefer a positive description of the target behavior. Retain a prohibition only for a hard safety or compliance guardrail, paired with the desired behavior.

## Router Skill

A single user-invoked skill designed to route the user's intent to more specialized skills, preventing menu overload.

## Steps

Actionable, sequential instructions that the agent must execute directly in `SKILL.md`.

## Reference

Durable vocabulary, language profiles, domain models, or specifications stored in auxiliary markdown files loaded conditionally via context pointers.

## Tool Allowance (allowed-tools)

The mandatory YAML frontmatter declaration specifying the explicit, space-delimited whitelist of tools and execution capabilities granted to a skill.

## Inline Skill Chaining

An invocation pattern where a caller skill incorporates a callee skill's domain rules directly into the current execution turn without creating an isolated subagent.

## Delegated Skill Invocation

An invocation pattern where an orchestrator dispatches an isolated subagent persona configured with a bounded task packet and specific active skills.
