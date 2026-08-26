# Handoff Document Template

Use this high-density markdown structure when serializing active agent context to `.agents/handoff.md` or a designated handoff file.

```markdown
# Agent Context Handoff

- **Date / Timestamp**: YYYY-MM-DD HH:MM:SS UTC
- **Active Branch**: task/<feature-name> (Base: <main-commit-hash>)
- **Session Focus**: <1-sentence core objective>

---

## 1. Executive Summary & Intent
- **Goal**: <Specific outcome the user requested>
- **Progress Stage**: [SPECIFY | PLAN | IMPLEMENT | VERIFY | SHIP]
- **Current Completion**: <X% / Milestones achieved>

---

## 2. Working State & Artifacts
- **Current Working Directory**: `<repo-root-path>`
- **Uncommitted Changes**:
  - `path/to/modified-file.ts`: <Nature of change>
  - `path/to/new-file.ts`: <Nature of change>
- **Verification Status**:
  - Passing Tests: `<suite-command>` (Passed: N tests)
  - Failing Tests / Red Signal: `<failing-test-name>` (if in Red phase)

---

## 3. Load-Bearing Decisions & Invariants
| Decision | Rationale | Rejected Alternative |
| :--- | :--- | :--- |
| `<Decision 1>` | `<Why this path was chosen>` | `<Alternative explored & discarded>` |
| `<Decision 2>` | `<Why this path was chosen>` | `<Alternative explored & discarded>` |

---

## 4. Unresolved Ambiguities & Open Questions
- [ ] `<Question or edge case pending user feedback>`
- [ ] `<External dependency or credential requirement>`

---

## 5. Resumption Instructions
1. Read the modified files listed in Section 2.
2. Execute `<command>` to verify the current baseline.
3. Perform `<next concrete action>` to satisfy the current phase exit gate.
```
