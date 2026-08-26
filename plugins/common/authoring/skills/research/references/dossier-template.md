# Technical Research Dossier Template

Use this high-density markdown schema when serializing research findings to `.agents/research/<topic>.md`.

```markdown
# Technical Research Dossier: <Topic Title>

- **Date**: YYYY-MM-DD
- **Target Subsystem / Domain**: `<subsystem-name>`
- **Scope & Version Constraints**: `<e.g., Python 3.12+, React 19, Go 1.23>`

---

## 1. Executive Summary & Recommendation
- **Core Recommendation**: `<1-paragraph clear technical recommendation>`
- **Primary Benefit**: `<Major performance, DX, or architectural advantage>`
- **Key Risk / Constraint**: `<Known drawback or migration requirement>`

---

## 2. Solution Comparison Matrix
| Solution / Library | Concurrency & Safety | Performance / Footprint | Ecosystem & Health | Complexity |
| :--- | :--- | :--- | :--- | :--- |
| **Option A (Recommended)** | <Rating / Note> | <Rating / Note> | <Rating / Note> | <Low/Med/High> |
| **Option B** | <Rating / Note> | <Rating / Note> | <Rating / Note> | <Low/Med/High> |
| **Option C** | <Rating / Note> | <Rating / Note> | <Rating / Note> | <Low/Med/High> |

---

## 3. Verified API Signature & Minimal Working Example
```<language>
// Minimal verified working pattern demonstrating the recommended approach
```

---

## 4. Known Gotchas & Anti-Patterns
- `<Gotcha 1: e.g., Unsafe default settings or connection leak>`
- `<Gotcha 2: e.g., Deprecated method in current minor version>`

---

## 5. Primary Citations & Reference Sources
- [Official Documentation](https://...)
- [API Reference](https://...)
- [Issue / RFC Reference](https://...)
```
