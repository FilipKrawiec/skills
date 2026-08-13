# SWOT Report Template & Artifact Format

This reference provides a compact, low-ceremony template for technical SWOT analyses and strategic audits, avoiding boilerplate and redundant narrative.

---

## Standard Compact Layout

```markdown
# Strategic SWOT: <Target Component / System>

**Target**: `<path/to/component>` | **Date**: `<YYYY-MM-DD>`

## Executive Summary
Brief 1–2 sentence summary of health, posture, and core recommendation.

## Quadrant Matrix

| Quadrant | Factor | Tier | Grounded Evidence |
| :--- | :--- | :--- | :--- |
| **Strength (S)** | Clean Port/Adapter boundary | P1 | `src/domain/ports/` |
| **Strength (S)** | 100% Branch coverage on domain core | P1 | `tests/unit/test_aggregate.py` |
| **Weakness (W)** | Hardcoded environment configuration | P0 | `src/infrastructure/config.py:42` |
| **Weakness (W)** | High cyclomatic complexity in dispatch | P2 | `src/application/service.py:110` |
| **Opportunity (O)** | Standardize shared validation scripts | P0 | `scripts/validate-plugin-definitions.py` |
| **Opportunity (O)** | Modernize runtime dependencies | P2 | `pyproject.toml` |
| **Threat (T)** | Upstream dependency deprecation in v2.0 | P0 | `package-metadata.json` |
| **Threat (T)** | Host permission differences | P1 | `.devcontainer/devcontainer.json` |

## Prioritized Action Roadmap

| Priority | Action Item | Target Path | Strategy Rationale |
| :--- | :--- | :--- | :--- |
| **P0** | Migrate hardcoded config to env loader | `src/infrastructure/config.py` | Eliminate runtime config failure (W -> Fix) |
| **P0** | Pin upstream dependency and add adapter | `src/adapters/` | Shield against upstream breaking change (T -> Shield) |
| **P1** | Add shared validation recipe | `justfile`, `scripts/` | Leverage reusable script ecosystem (O -> Adopt) |
| **P2** | Refactor complex dispatch routing | `src/application/service.py` | Reduce maintenance friction (W -> Clean) |
```
