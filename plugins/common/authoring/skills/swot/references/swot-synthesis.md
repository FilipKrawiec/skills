# SWOT Synthesis & Executive Report Guidelines

This reference defines the reconciliation protocol and executive report template for consolidating SWOT observations into a final decision artifact.

---

## 1. Synthesis Protocol

When aggregating findings from solo exploration or multiple specialized subagents:

1. **Aggregate Findings**: Gather all observation items across evaluated domain lenses.
2. **Deduplicate & Unify**: Merge overlapping findings that refer to the same underlying code path or root cause.
3. **Calibrate Priority**: If multiple personas flag the same issue with different tiers, adopt the highest severity rating (`P0 > P1 > P2`).
4. **Formulate Action Roadmap**: Translate each verified Weakness and Threat into a concrete, prioritized engineering action with target file boundaries.

---

## 2. Executive SWOT Report Template

```markdown
# Strategic SWOT: <Target Solution / Component>

**Target**: `<path/to/component>` | **Date**: `<YYYY-MM-DD>` | **Mode**: `Solo` | `Collaborative (<Persona List>)`

## Executive Summary
Brief 1–2 sentence summary of overall architectural health, strategic posture, and primary recommendation.

## Consolidated Quadrant Matrix

| Quadrant | Factor | Tier | Lens / Persona | Grounded Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Strength (S)** | Clean Port/Adapter boundary | P1 | `solution-architect` | `src/domain/ports/` |
| **Strength (S)** | 100% Branch coverage on domain core | P1 | `quality-engineer` | `tests/unit/test_aggregate.py` |
| **Weakness (W)** | Hardcoded credential in config loader | P0 | `security-auditor` | `src/infrastructure/config.py:42` |
| **Weakness (W)** | High cyclomatic complexity in dispatch | P2 | `developer` | `src/application/service.py:110` |
| **Opportunity (O)** | Standardize shared validation scripts | P0 | `quality-engineer` | `scripts/validate-plugin-definitions.py` |
| **Opportunity (O)** | Modernize runtime dependencies | P2 | `developer` | `pyproject.toml` |
| **Threat (T)** | Upstream dependency deprecation in v2.0 | P0 | `solution-architect` | `package-metadata.json` |
| **Threat (T)** | Host permission differences | P1 | `developer` | `.devcontainer/devcontainer.json` |

## Prioritized Action Roadmap

| Priority | Action Item | Target Path | Strategy Rationale |
| :--- | :--- | :--- | :--- |
| **P0** | Migrate hardcoded config to env loader | `src/infrastructure/config.py` | Eliminate runtime config and security leak (W -> Fix) |
| **P0** | Pin upstream dependency and add adapter | `src/adapters/` | Shield against upstream breaking change (T -> Shield) |
| **P1** | Add shared validation recipe | `justfile`, `scripts/` | Leverage reusable script ecosystem (O -> Adopt) |
| **P2** | Refactor complex dispatch routing | `src/application/service.py` | Reduce maintenance friction (W -> Clean) |
```
