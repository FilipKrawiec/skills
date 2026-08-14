---
name: teach
description: Use when generating an interactive learning guide to explain technical components, review best practices, and compare trade-offs.
disable-model-invocation: true
allowed-tools: Read Edit
---

# Teach (Interactive Learning Skill)

Use this explicitly requested skill to explain components, challenge designs, compare alternatives, and align on a direction.

## Playbook Steps

1. Identify the relevant components, technologies, and architectural question.
2. Research applicable practices and pitfalls; compare one or two viable alternatives.
3. Create one self-contained HTML page at `.agents/knowledge/teach-learning.html` using semantic HTML, CSS, and native JavaScript unless the user requests another stack. Include the purpose, component/data flow, an interactive trade-off comparison, best-practice checklist, and alignment prompt.
4. Link the generated local file in the response, summarize the findings, and wait for direction.
