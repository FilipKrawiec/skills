# Custom Rule: Resolve Skill Reference Paths

When a skill says to read a relative file (`references/<file>.md`) and its condition holds, resolve the path against the directory of that skill's `SKILL.md`, whose absolute path is in the available-skills list, and open it with `view_file` using the absolute path. Never resolve it against the workspace.
