---
name: teach
description: Generate an interactive learning guide to explain technical components, review best practices, and compare trade-offs.
user-invocable: true
---

# Teach (Interactive Learning Skill)

This skill is invoked explicitly by the user to explain how specific codebase components work, align on industry best practices, challenge proposed designs, explore alternative solutions, and view interactive trade-offs.

## Playbook Steps

1. **Analyze Context:**
   - Scan the user prompt and codebase to identify the target components, libraries, frameworks, and architecture involved in the task.

2. **Conduct Knowledge Research:**
   - Search available references or knowledge bases to list industry best practices, common pitfalls, and modern design standards for the identified technologies.
   - Contrast the proposed approach with 1-2 viable alternatives (e.g., polling vs. webhooks, stateful vs. stateless).

3. **Generate Interactive HTML Page:**
   - Generate a single, self-contained, beautiful HTML document at `.agents/knowledge/teach-learning.html`.
   - **Styling Requirements:**
     - Use clean, semantic HTML5, pure CSS, and native JavaScript. Do not use external libraries/frameworks unless requested.
     - Apply rich, modern aesthetics (e.g., sleek theme, modern typography, smooth gradients, glassmorphic panels).
   - **Content Requirements:**
     - **Title & Mission Statement**: Clearly state what is being explained and why.
     - **Movable Parts**: An interactive breakdown of the system components and how data/control flows between them.
     - **Trade-Off Interactive Panel**: Interactive tabs or a comparison slider representing factors like *Complexity*, *Cost*, *Performance*, and *Maintainability* for the proposed solution vs. the alternative(s).
     - **Best Practices Checklist**: Key standards and guidelines applied to this domain.
     - **Alignment Prompt**: A final prompt asking the user to confirm the technical approach.

4. **Present and Align:**
   - Provide a standard markdown clickable file link to the generated page in the chat response: `[Teach Learning Page](file://<absolute-path-to-repo>/.agents/knowledge/teach-learning.html)`.
   - Offer a brief, concise summary of the key findings in the chat response.
   - Explicitly wait for the user's feedback or approval on the technical direction.
