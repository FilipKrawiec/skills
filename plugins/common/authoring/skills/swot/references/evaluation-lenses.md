# Domain Evaluation Lenses & Audit Guidelines

This reference defines domain audit lenses, inspection checklists, and contribution return contracts for evidence-grounded SWOT evaluations.

---

## 1. Core Domain Evaluation Lenses

During single-agent or collaborative audits, inspect the target across four orthogonal domain lenses:

| Lens / Persona | Focus Domain | Core Audit Checkpoints |
| :--- | :--- | :--- |
| **Domain & Architecture**<br>*(solution-architect)* | Hexagonal Isolation & DDD Purity | Domain purity (zero framework/ORM imports in `domain/`), aggregate invariant encapsulation, port/adapter interfaces, dependency direction. |
| **Security & Attack Surface**<br>*(security-auditor)* | Vulnerability & Safety | Input sanitization, credential/secret leaks, shell injection risks, permission boundaries, OWASP Top 10 vulnerabilities, dependency CVEs. |
| **Verification & Test Rigor**<br>*(quality-engineer)* | Assertion Strength & Coverage | Deterministic verification gates, Chicago-style state assertions, edge-case coverage, absence of hollow assertions, negative path testing. |
| **Maintainability & DX**<br>*(developer)* | Code Hygiene & Ergonomics | Code clarity, Rule of Two Adapters, YAGNI compliance, modularity, refactoring leverage, build and tool ergonomics. |

---

## 2. Custom Project Personas

Target projects can register custom evaluation lenses (e.g. database administration, performance engineering):

```yaml
custom_personas:
  - name: db-administrator
    lens: Database & Data Integrity
    focus: Schema migrations, query indexing, transactional boundaries, data isolation.
```

---

## 3. Grounded Findings Matrix & Return Envelope

Record observations for each lens using this structured matrix:

```markdown
### Lens Findings: <Lens Name> (<Persona Name>)

| Quadrant | Factor | Tier | Grounded Citation | Action / Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **Strength (S)** | <Working pattern or clean boundary> | P1 | `src/domain/aggregate.py:24` | Preserve invariant pattern |
| **Weakness (W)** | <Defect, tech debt, or risk> | P0 | `src/infrastructure/db.py:56` | Encapsulate DB queries behind port |
| **Opportunity (O)** | <Upstream feature or shared tool> | P1 | `scripts/verify.py` | Integrate into local CI gate |
| **Threat (T)** | <Breaking change or external risk> | P0 | `pyproject.toml:12` | Pin dependency and add adapter |
```

---

## 4. Execution Rules

- **Mandatory Direct Citations**: Every observation must cite a concrete file path, test suite, or configuration line.
- **Strict Tiering**: Use standard P0 (Critical/Blocker), P1 (High leverage), or P2 (Medium/Low polish) tiers.
- **Direct Actions**: Pair every weakness and threat with an actionable engineering remediation.
