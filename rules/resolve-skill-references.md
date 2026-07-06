# Custom Rule: Resolve Skill Reference Relative Paths

Follow this protocol to ensure relative file references in active skills are successfully loaded and used.

## Context
The `agentskills.io` standard requires relative links (e.g., `references/strategic-design.md`) within `SKILL.md` to maintain skill portability. However, the system's `view_file` tool strictly requires an absolute path.

## Protocol for Agents
When any skill is active (e.g., `domain-driven-design` or `hexagonal-architecture`), you MUST resolve and read its local reference files before proceeding with tasks that depend on those concepts:

1. **Locate the Skill's Absolute Path:**
   - Look at the `Available skills` list in your system prompt to find the absolute path of the active skill's `SKILL.md` file (e.g., `/Users/filip/.gemini/config/plugins/filipkrawiec/skills/domain-driven-design/SKILL.md`).

2. **Construct the Reference's Absolute Path:**
   - Combine the parent directory of that `SKILL.md` with the relative path of the reference link.
   - *Example:* If the skill is `domain-driven-design` and the reference is `references/strategic-design.md`, the resolved absolute path is:
     `/Users/filip/.gemini/config/plugins/filipkrawiec/skills/domain-driven-design/references/strategic-design.md`

3. **Read the Reference:**
   - Call the `view_file` tool with the constructed absolute path.
   - Do NOT assume you can view it via a relative path from your current workspace directory.
