# SWOT Report Template & Artifact Format

This reference provides standard structured markdown layouts and reporting templates for technical SWOT analyses and strategic audits.

---

## 1. Standard Report Structure

When producing a SWOT audit artifact or report, use the following layout:

```markdown
# Strategic SWOT Evaluation: <Target Component / System>

**Target**: `<path/to/component>` | **Evaluator**: `<agent-persona / author>` | **Date**: `<YYYY-MM-DD>`

## Executive Summary
Brief high-level overview of findings, overall architectural health, key risk posture, and primary strategic direction.

## Scored Quadrant Matrix

| Quadrant | Factor | Impact | Urgency | Feasibility | Tier | Grounded Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Strength** | Clean Port/Adapter boundary | 5 | 3 | 5 | P1 | `src/domain/ports/` |
| **Strength** | 100% Branch coverage on core domain | 4 | 3 | 5 | P1 | `tests/unit/test_aggregate.py` |
| **Weakness** | Hardcoded environment configuration | 4 | 4 | 4 | P0 | `src/infrastructure/config.py:42` |
| **Weakness** | High cyclomatic complexity in dispatch | 3 | 3 | 3 | P2 | `src/application/service.py:110` |
| **Opportunity** | Adopt Python 3.12 syntax improvements | 3 | 2 | 4 | P2 | `pyproject.toml` |
| **Opportunity** | Reuse shared repository validation script | 4 | 4 | 5 | P0 | `scripts/validate-plugin-definitions.py` |
| **Threat** | Upstream dependency deprecation in v2.0 | 5 | 4 | 2 | P0 | `package-metadata.json` |
| **Threat** | Host-specific permission constraints | 4 | 3 | 3 | P1 | `.devcontainer/devcontainer.json` |

## Detailed Evidence & Observations

### Strengths (Internal Positive)
1. **Factor Title**: Detailed observation and why it provides structural advantage.
   - **Evidence**: `path/to/file.py:L10-L40`
   - **Metric**: Measured metric (e.g. coverage, latency, modularity).

### Weaknesses (Internal Negative)
1. **Factor Title**: Detailed deficit or technical debt description.
   - **Evidence**: `path/to/file.py:L120-L150`
   - **Root Cause**: Architectural or historical context.

### Opportunities (External Positive)
1. **Factor Title**: External trend, new standard, or ecosystem tool.
   - **Evidence**: Upstream documentation or benchmark comparison.
   - **Potential Value**: Expected ROI or efficiency gain.

### Threats (External Negative)
1. **Factor Title**: External risk, security threat, or breaking change.
   - **Evidence**: Vulnerability advisory or deprecation notice.
   - **Impact Radius**: Affected subsystems and failure modes.

## TOWS Strategic Action Plan

### SO Strategies (Capitalize on Strengths & Opportunities)
- **SO-1**: Action item leveraging internal strength to seize external opportunity.

### WO Strategies (Remediate Weaknesses via Opportunities)
- **WO-1**: Action item resolving internal deficit using ecosystem tool.

### ST Strategies (Defend Strengths against Threats)
- **ST-1**: Action item utilizing architectural robustness to shield from upstream shifts.

### WT Strategies (Minimize Weaknesses & Avoid Threats)
- **WT-1**: Action item eliminating vulnerable code paths to prevent threat exposure.

## Recommended Implementation Roadmap

| Priority | Strategy ID | Action Item | Target Paths | Owner / Persona |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | WT-1 | Refactor hardcoded configuration to dynamic environment loader | `src/infrastructure/config.py` | `developer` |
| **P0** | WO-1 | Migrate to shared validator script | `scripts/` | `developer` |
| **P1** | ST-1 | Introduce version pinning and compatibility adapter | `src/adapters/` | `solution-architect` |
| **P2** | SO-1 | Upgrade type annotations to modern union syntax | `src/domain/` | `developer` |
```
