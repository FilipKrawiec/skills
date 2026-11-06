# Area audit

For a codebase or area instead of a diff, cover all in-scope code, including pre-existing defects: answer all four questions in `SKILL.md` phase 2 and in [hot-paths.md](hot-paths.md), and ask the host for a leaf mutation sample on domain files. Report one row per smell, tagged as in `SKILL.md`, ranked by likely rework, then the mutation table; no line cap.

```text
| Smell | Tag | Count | Strongest examples (3 × file:line) | Refactoring | Estimate S/M/L |
```
