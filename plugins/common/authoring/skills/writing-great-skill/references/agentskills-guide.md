# Agent Skills Creation & Specification Guide

This guide compiles the canonical best practices, description optimization rules, evaluation strategies, script integration patterns, and format specifications from [agentskills.io](https://agentskills.io).

### Source URLs for Reference:
* **Best Practices**: https://agentskills.io/skill-creation/best-practices
* **Optimizing Descriptions**: https://agentskills.io/skill-creation/optimizing-descriptions
* **Evaluating Skills**: https://agentskills.io/skill-creation/evaluating-skills
* **Using Scripts**: https://agentskills.io/skill-creation/using-scripts
* **Specification**: https://agentskills.io/specification

---

## 1. Best Practices for Skill Creators

### Start from Real Expertise
A common pitfall in skill creation is asking an LLM to generate a skill without providing domain-specific context — relying solely on the LLM's general training knowledge. The result is vague, generic procedures ("handle errors appropriately," "follow best practices for authentication") rather than the specific API patterns, edge cases, and project conventions that make a skill valuable.

Effective skills are grounded in real expertise. The key is feeding domain-specific context into the creation process.

#### Extract from a Hands-on Task
Complete a real task in conversation with an agent, providing context, corrections, and preferences along the way. Then extract the reusable pattern into a skill. Pay attention to:
* **Steps that worked** — the sequence of actions that led to success.
* **Corrections you made** — places where you steered the agent's approach (e.g., "use library X instead of Y," "check for edge case Z").
* **Input/output formats** — what the data looked like going in and coming out.
* **Context you provided** — project-specific facts, conventions, or constraints the agent didn't already know.

#### Synthesize from Existing Project Artifacts
When you have a body of existing knowledge, you can feed it into an LLM and ask it to synthesize a skill. A data-pipeline skill synthesized from your team's actual incident reports and runbooks will outperform one synthesized from a generic "data engineering best practices" article, because it captures *your* schemas, failure modes, and recovery procedures. The key is project-specific material, not generic references.

Good source material includes:
* Internal documentation, runbooks, and style guides.
* API specifications, schemas, and configuration files.
* Code review comments and issue trackers (captures recurring concerns and reviewer expectations).
* Version control history, especially patches and fixes (reveals patterns through what actually changed).
* Real-world failure cases and their resolutions.

### Refine with Real Execution
The first draft of a skill usually needs refinement. Run the skill against real tasks, then feed the results — all of them, not just failures — back into the creation process. Ask: what triggered false positives? What was missed? What could be cut?

Even a single pass of execute-then-revise noticeably improves quality, and complex domains often benefit from several.

> [!TIP]
> Read agent execution traces, not just final outputs. If the agent wastes time on unproductive steps, common causes include instructions that are too vague, instructions that don't apply to the current task, or too many options presented without a clear default.

### Spending Context Wisely
Once a skill activates, its full `SKILL.md` body loads into the agent's context window. Every token in your skill competes for the agent's attention.

#### Add What the Agent Lacks, Omit What It Knows
Focus on what the agent *wouldn't* know without your skill: project-specific conventions, domain-specific procedures, non-obvious edge cases, and the particular tools or APIs to use. You don't need to explain what a PDF is, how HTTP works, or what a database migration does.

```markdown
<!-- Too verbose — the agent already knows what PDFs are -->
## Extract PDF text
PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. pdfplumber is recommended because it handles most cases well.

<!-- Better — jumps straight to what the agent wouldn't know on its own -->
## Extract PDF text
Use pdfplumber for text extraction. For scanned documents, fall back to
pdf2image with pytesseract.
```

Ask yourself about each piece of content: "Would the agent get this wrong without this instruction?" If the answer is no, cut it.

#### Design Coherent Units
Deciding what a skill should cover is like deciding what a function should do: you want it to encapsulate a coherent unit of work that composes well with other skills. Skills scoped too narrowly force multiple skills to load for a single task, risking overhead and conflicting instructions. Skills scoped too broadly become hard to activate precisely.

#### Aim for Moderate Detail
Concise, stepwise guidance with a working example tends to outperform exhaustive documentation. When you find yourself covering every edge case, consider whether most are better handled by the agent's own judgment.

#### Structure Large Skills with Progressive Disclosure
The specification recommends keeping `SKILL.md` under 500 lines and 5,000 tokens — just the core instructions the agent needs on every run. When a skill legitimately needs more content, move detailed reference material to separate files in `references/` or similar directories and tell the agent *when* to load each file.

---

## 2. Optimizing Skill Descriptions

The `description` field in your `SKILL.md` frontmatter is the primary mechanism agents use to decide whether to load a skill for a given task. 

### Writing Effective Descriptions
* **Use imperative phrasing:** Frame the description as an instruction to the agent: "Use this skill when..."
* **Focus on user intent, not implementation:** Describe what the user is trying to achieve, not the skill's internal mechanics.
* **Err on the side of being pushy:** Explicitly list contexts where the skill applies.
* **Keep it concise:** The specification enforces a hard limit of 1024 characters.

### Designing Trigger Eval Queries
To test triggering, you need a set of eval queries — realistic user prompts labeled with whether they should or shouldn't trigger your skill. Aim for about 20 queries (10 positives, 10 negatives).

#### Should-not-trigger Queries (Near-misses)
The most valuable negative test cases are **near-misses** — queries that share keywords or concepts with your skill but actually need something different. These test whether the description is precise, not just broad.

### The Optimization Loop
1. **Evaluate** the current description on both train (\~60%) and validation (\~40%) sets.
2. **Identify failures** in the train set: which should-trigger queries didn't trigger? Which should-not-trigger queries did?
3. **Revise the description** to generalize. Avoid adding specific keywords from failed queries (to prevent overfitting).
4. **Repeat** until all train set queries pass or you stop seeing meaningful improvement.
5. **Select the best iteration** by its validation pass rate.

---

## 3. Evaluating Skill Output Quality

Running structured evaluations (evals) allows you to systematically improve skill output quality.

### Designing Test Cases
A test case has three parts:
* **Prompt**: A realistic user message.
* **Expected output**: A human-readable description of what success looks like.
* **Input files** (optional).

Store test cases in `evals/evals.json` inside your skill directory.

### Workspace Structure for Evals
Organize eval results in a workspace directory alongside your skill directory:
```
csv-analyzer/
├── SKILL.md
└── evals/
    └── evals.json
csv-analyzer-workspace/
└── iteration-1/
    ├── eval-top-months-chart/
    │   ├── with_skill/
    │   └── without_skill/
```

### Spawning Runs
Each eval run should start with a clean context. If the environment supports subagents, run each evaluation task inside a fresh subagent to ensure isolation. Record token count and duration (`timing.json`) upon completion.

### Assertions & Grading
Assert checkable, objective criteria. Grade each assertion as **PASS** or **FAIL** with concrete evidence.
* **PASS**: Require concrete evidence. Don't give the benefit of the doubt.
* **Holistic Quality**: Complement assertion tests with blind comparisons scored by an LLM judge.

---

## 4. Using Scripts in Skills

Skills can instruct agents to run shell commands and bundle reusable scripts in a `scripts/` directory.

### One-off Commands
Ecosystem tools like `uvx`, `pipx`, `npx`, `bunx`, `deno run`, or `go run` can execute external packages without local installation. Always pin versions (e.g. `npx eslint@9.0.0`) for reproducibility.

### Self-Contained Scripts
When packaging custom logic in `scripts/`, declare dependencies inline to keep them self-contained:
* **Python (PEP 723)**:
  ```python
  # /// script
  # dependencies = ["beautifulsoup4"]
  # ///
  ```
  Run with `uv run scripts/extract.py`.
* **Deno/Bun**: Import packages directly with version specifiers (`npm:cheerio@1.0.0` or `cheerio@1.0.0`).

### Designing Scripts for Agents
* **Avoid interactive prompts**: Shell environments are non-interactive. All inputs must be supplied via command-line flags, env vars, or stdin.
* **Document usage with `--help`**: Provide a concise summary of flags and examples.
* **Write helpful error messages**: Say what went wrong, what was expected, and how to fix it.
* **Use structured output**: Prefer JSON, CSV, or TSV. Send clean data to `stdout` and diagnostic logs/warnings to `stderr`.

---

## 5. Specification

The complete format specification for Agent Skills.

### Directory Structure
```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
├── assets/           # Optional: templates, resources
```

### Frontmatter Fields in `SKILL.md`
* **`name`**: Required. Max 64 chars. Lowercase alphanumeric and hyphens only. Must match parent directory.
* **`description`**: Required. Max 1024 chars. Context-triggering text.
* **`license`**: Optional. Name or reference to a bundled license file.
* **`compatibility`**: Optional. Max 500 chars. System packages/runtime requirements.
* **`metadata`**: Optional. Key-value string map for custom settings.

### Progressive Disclosure Rules
Skills should be structured to take advantage of progressive disclosure:
1. **Metadata** (\~100 tokens): loaded at startup.
2. **Instructions** (\< 5000 tokens): `SKILL.md` body is loaded when skill is activated.
3. **Resources**: files in `scripts/`, `references/`, or `assets/` loaded on demand via relative path links.
