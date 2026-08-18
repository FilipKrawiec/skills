---
name: swot
description: Use when performing a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats), strategic audit, or architectural health evaluation of a codebase, skill, framework, or technical component.
disable-model-invocation: true
allowed-tools: Skill Read Edit Bash
---

# SWOT Analysis (Strategic Evaluation Skill)

Perform evidence-grounded strategic audits and architectural health evaluations across technical components, codebases, frameworks, or entire solutions.

## Playbook Modes

### 1. Single-Agent Multi-Lens Mode (Default)
1. **Scope & Inspect Across Lenses**: Evaluate target codebase/component through the 4 domain lenses (`evaluation-lenses.md`: Architecture & DDD/Hexagonal, Security & Attack Surface, Verification & Test Rigor, Maintainability & DX) in a single pass.
2. **Classify Factors**: Map verified findings to Strengths, Weaknesses, Opportunities, and Threats with P0/P1/P2 priority tiers (`swot-methodology.md`).
3. **Publish Report**: Compile the consolidated quadrant matrix and prioritized action roadmap (`swot-synthesis.md`).

### 2. Collaborative Multi-Agent Mode (Opt-In for Multi-Repo Boundaries)
1. **Dispatch Persona Subagents**: Spawn dedicated personas (`solution-architect`, `security-auditor`, `quality-engineer`, `developer`) only when evaluating across distinct repository boundaries.
2. **Collect & Synthesize**: Gather structured findings matrices, deduplicate overlapping factors, and compile the final executive report.

---

## Context Pointers

- Read [evaluation-lenses.md](references/evaluation-lenses.md) when auditing target code across domain lenses or defining custom evaluation criteria.
- Read [swot-methodology.md](references/swot-methodology.md) when classifying factors, grounding observations in direct file citations, or applying P0/P1/P2 tiers.
- Read [swot-synthesis.md](references/swot-synthesis.md) when compiling the consolidated quadrant matrix and prioritized action roadmap.
