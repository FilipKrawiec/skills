# Subagent SWOT Contribution Guidelines

This reference defines domain audit lenses and return contracts for specialized subagent personas contributing to a collaborative SWOT evaluation.

---

## 1. Domain Evaluation Lenses

When an orchestrator dispatches specialized subagents to evaluate a solution or codebase, each persona audits the target through its specialized domain lens:

| Persona | Evaluation Lens | Core Audit Focus |
| :--- | :--- | :--- |
| `solution-architect` | **Domain & Hexagonal Architecture** | Domain purity (zero framework/ORM dependencies in `domain/`), aggregate invariant encapsulation, port/adapter boundaries, layer isolation. |
| `security-auditor` | **Security & Attack Surface** | Input sanitization, credential/secret leaks, shell injection vectors, permission boundaries, OWASP Top 10 vulnerabilities, dependency CVEs. |
| `quality-engineer` | **Verification & Test Rigor** | Deterministic verification gates, test assertion strength, edge-case coverage, absence of dummy/empty assertions, test-execution performance. |
| `developer` | **Maintainability & DX** | Code clarity, Rule of Two Adapters, YAGNI compliance, refactoring leverage, build ergonomics, cognitive load. |

---

## 2. Custom Project Personas

Target projects can register custom personas (e.g. `db-administrator`, `performance-engineer`) by defining domain-specific lenses:

```yaml
custom_personas:
  - name: db-administrator
    lens: Database & Data Integrity
    focus: Schema migrations, query indexing, transactional boundaries, data isolation.
```

---

## 3. Contribution Return Envelope

Each subagent emits its domain findings using a structured `SWOT_CONTRIBUTION` envelope:

```markdown
### SWOT Contribution: <Persona Name> (<Evaluation Lens>)

#### Findings Matrix

| Quadrant | Factor | Tier | Grounded Citation | Action / Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **Strength (S)** | <Working pattern or clean boundary> | P1 | `src/domain/aggregate.py:24` | Preserve invariant pattern |
| **Weakness (W)** | <Defect, tech debt, or risk> | P0 | `src/infrastructure/db.py:56` | Encapsulate DB queries behind port |
| **Opportunity (O)** | <Upstream feature or shared tool> | P1 | `scripts/verify.py` | Integrate into local CI gate |
| **Threat (T)** | <Breaking change or external risk> | P0 | `pyproject.toml:12` | Pin dependency and add adapter |

#### Persona Summary
Brief 1–2 sentence summary of domain health and posture.
```

---

## 4. Execution Rules for Subagents

- **Mandatory File Citations**: Every observation in the contribution matrix must cite a concrete file path, test suite, or config location.
- **Strict Tiering**: Use standard P0 (Critical/Blocker), P1 (High leverage), or P2 (Medium/Low polish) tiers.
- **Direct Actions**: Pair every weakness or threat with an actionable engineering mitigation.
