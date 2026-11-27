# Evaluating a Skill

Source: https://agentskills.io/skill-creation/evaluating-skills

## Triggering

- Write about 20 prompts: 10 that should load the skill, 10 near-misses that share its words but need something else.
- Run each in a fresh agent; record whether the skill loaded.
- Fix the description to generalise, never by pasting a failed prompt's words into it.

## Behaviour

- Pick a real task the skill exists for. Run it in a fresh subagent with the skill and once without.
- Read the trace, not only the result. Wasted steps point to a vague rule, a rule that does not apply, or options without a default.
- Grade each expected outcome PASS or FAIL with evidence from the trace. No evidence is FAIL.
- Keep a change only when the run with it beats the run without it.

## Implementer bench

Required for a change to `ddd`, `hexagonal-architecture` or `tdd`; a hand-picked run is not enough.

- Run `node plugins/common/workflow/scripts/workflow.mjs bench --implementer` first: it validates `docs/implementer-benchmark.json` and lists the seeded tasks, spending nothing.
- Then run it with `--run --out RESULT.json`. It replays each task on the cheapest delivery setting (`sessionFor('implementer', 'R0')`) once with the skills at the working tree and once at `--baseline REF` (default the merge base with the default branch), and grades by deterministic checks only: layer imports, raw primitives on public domain signatures, a red run before the fix, the project gate. It starts no task once reported cost reaches 10 USD and lists the skipped ones.
- Keep the change only when the working-tree arm's overall pass rate is no lower than the baseline's at no higher cost per task. Save the Markdown record and the result JSON under `docs/records/` (the arms, setting, task set and cost), and use `--compare` against an earlier result.

## Cutting

For each line ask: would the run go wrong without it? Delete it unless the answer is yes and a run shows it.

## Scripts

- Inputs by flag, env var or stdin; no prompts.
- `--help` with one example; errors say what was expected and how to fix it.
- Data on stdout, diagnostics on stderr; JSON when another agent reads it.
- Pin versions of one-off tools (`npx eslint@9.0.0`).

## Example

Bad, a pointer the agent may never follow: "Then run board.md's Merge gate."

Good, the step itself: "Run `git merge --no-ff --no-commit origin/<base>`; resolve conflicts, then commit through the workflow CLI."
