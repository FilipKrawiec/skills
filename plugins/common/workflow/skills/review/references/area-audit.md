# Area audit

For a codebase or area instead of a diff, cover all in-scope code, including pre-existing defects: sweep every signal in `SKILL.md` phases 2 and 3 and in [hot-paths.md](hot-paths.md), and ask the host for a leaf mutation sample on domain files. Report one row per smell ranked by likely rework, then the mutation table; no line cap.

```text
| Smell | Count | Strongest examples (3 × file:line) | Refactoring | Estimate S/M/L |
```
